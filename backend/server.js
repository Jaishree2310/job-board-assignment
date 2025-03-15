const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

mongoose.connect("mongodb://127.0.0.1:27017/job-board", {
  serverSelectionTimeoutMS: 8000,
})
  .then(() => console.log("MongoDB connected successfully"))
  .catch(err => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: { type: String, required: true },
  experience: { type: String, default: 'Not specified' },
  link: { type: String, required: true },
  source: { type: String, required: true },
  crawled_at: { type: Date, default: Date.now },
  searched_title: { type: String },
  searched_location: { type: String }
});

const Job = mongoose.model('Job', jobSchema);

app.get('/api/jobs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    console.log(`Fetching jobs: page=${page}, limit=${limit}`);
    const skip = (page - 1) * limit;
    
    const query = {};
    
    if (req.query.title) {
      query.title = { $regex: req.query.title, $options: 'i' };
    }
    
    if (req.query.location) {
      query.location = { $regex: req.query.location, $options: 'i' };
    }
    
    if (req.query.company) {
      query.company = { $regex: req.query.company, $options: 'i' };
    }
    
    if (req.query.experience) {
      query.experience = { $regex: req.query.experience, $options: 'i' };
    }
    
    if (req.query.source) {
      query.source = req.query.source;
    }
    
    if (req.query.searched_title) {
      query.searched_title = { $regex: req.query.searched_title, $options: 'i' };
    }
    
    if (req.query.searched_location) {
      query.searched_location = { $regex: req.query.searched_location, $options: 'i' };
    }
    
    const jobs = await Job.find(query).sort({ crawled_at: -1 }).skip(skip).limit(limit);
    const total = await Job.countDocuments(query);
    
    res.json({
      jobs,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalJobs: total
    });
  } catch (err) {
    console.error('Error fetching jobs:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    res.json(job);
  } catch (err) {
    console.error('Error fetching job details:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/job-categories', async (req, res) => {
  try {
    const categories = await Job.distinct('searched_title');
    res.json(categories.filter(category => category)); 
  } catch (err) {
    console.error('Error fetching job categories:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/job-locations', async (req, res) => {
  try {
    const locations = await Job.distinct('searched_location');
    res.json(locations.filter(location => location));
  } catch (err) {
    console.error('Error fetching job locations:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/run-scraper', (req, res) => {
  console.log('Manually triggering LinkedIn job scraper...');
  runScraper((error, count) => {
    if (error) {
      return res.status(500).json({ message: 'Error running scraper', error });
    }
    res.json({ message: `Scraper completed successfully. Added ${count} new jobs from LinkedIn.` });
  });
});

const processJobData = async (jobData) => {
  try {
    const existingJob = await Job.findOne({ 
      title: jobData.title, 
      company: jobData.company,
      link: jobData.link
    });
    
    if (!existingJob) {
      const newJob = new Job({
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        experience: jobData.experience,
        link: jobData.link,
        source: "LinkedIn", 
        crawled_at: jobData.crawled_at || new Date().toISOString(),
        searched_title: jobData.searched_title || "Product Manager",
        searched_location: jobData.searched_location || "Remote"
      });

      await newJob.save();
      console.log(`New LinkedIn job added: ${jobData.title} at ${jobData.company}`);
    } else {
      console.log(`LinkedIn job already exists: ${jobData.title} at ${jobData.company}`);
    }
  } catch (err) {
    console.error('Error processing LinkedIn job data:', err);
  }
};

const runScraper = (callback) => {
  const scriptPath = path.join(__dirname, 'scraper.py'); 
  exec(`node ${scriptPath}`, async (error, stdout, stderr) => {
    if (error) {
      console.error('Error running LinkedIn scraper:', error);
      return callback(error, null);
    }
    
    console.log('LinkedIn Scraper output:', stdout);

    try {
      let linkedInJobs = [];

      if (fs.existsSync('linkedin_jobs.json')) {
        linkedInJobs = JSON.parse(fs.readFileSync('linkedin_jobs.json', 'utf8'));
      }

      let newJobsCount = 0;
      for (const job of linkedInJobs) {
        await processJobData(job);
        newJobsCount++;
      }

      callback(null, newJobsCount);
    } catch (err) {
      console.error('Error processing LinkedIn jobs:', err);
      callback(err, null);
    }
  });
};

cron.schedule('0 */12 * * *', () => {
  console.log('Scheduled job: Running LinkedIn scraper...');
  runScraper((error, count) => {
    if (error) {
      console.error('Scheduled LinkedIn scraper failed:', error);
    } else {
      console.log(`Scheduled LinkedIn scraper completed. Added ${count} new jobs.`);
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

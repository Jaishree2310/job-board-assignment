import requests
from bs4 import BeautifulSoup
import json
import time
from datetime import datetime
import logging
from random import randint

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler("scraper.log"), logging.StreamHandler()]
)
logger = logging.getLogger("JobScraper")

class JobScraper:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        }
        self.results = []
        
    def scrape_linkedin(self, keywords=None, locations=None, pages=2):
        if keywords is None:
            keywords = ["Software Engineer"]
        
        if locations is None:
            locations = [""]
            
        logger.info(f"Starting LinkedIn scrape for multiple job titles and locations")
        
        for keyword in keywords:
            for location in locations:
                encoded_keyword = keyword.replace(" ", "%20")
                encoded_location = location.replace(" ", "%20")
                
                logger.info(f"Searching for {keyword} in {location or 'any location'}")
                
                for page in range(pages):
                    url = f"https://www.linkedin.com/jobs/search/?keywords={encoded_keyword}&location={encoded_location}&start={page*25}"
                    logger.info(f"Scraping page {page+1}: {url}")
                    
                    try:
                        response = requests.get(url, headers=self.headers)
                        soup = BeautifulSoup(response.content, 'html.parser')
                        
                        job_cards = soup.find_all("div", class_="base-card")
                        
                        if not job_cards:
                            logger.warning(f"No job cards found on page {page+1} for {keyword} in {location}")
                            break
                        
                        for card in job_cards:
                            try:
                                title_elem = card.find("h3", class_="base-search-card__title")
                                company_elem = card.find("h4", class_="base-search-card__subtitle")
                                location_elem = card.find("span", class_="job-search-card__location")
                                link_elem = card.find("a", class_="base-card__full-link")
                                
                                if title_elem and company_elem and location_elem and link_elem:
                                    job = {
                                        "title": title_elem.text.strip(),
                                        "company": company_elem.text.strip(),
                                        "location": location_elem.text.strip(),
                                        "link": link_elem.get("href"),
                                        "source": "LinkedIn",
                                        "crawled_at": datetime.now().isoformat(),
                                        "experience": "Not specified",
                                        "searched_title": keyword,
                                        "searched_location": location,
                                    }
                                    self.results.append(job)
                                    logger.info(f"Scraped job: {job['title']} at {job['company']}")
                            except Exception as e:
                                logger.error(f"Error parsing job card: {e}")
                        
                        time.sleep(randint(2, 5)) 
                        
                    except Exception as e:
                        logger.error(f"Error scraping LinkedIn page {page+1} for {keyword} in {location}: {e}")
                        
        logger.info(f"LinkedIn scraping complete. Found {len(self.results)} jobs.")
        return self.results

    def save_to_json(self, filename="multi_jobs_data.json"):
        if not self.results:
            logger.warning("No jobs found! JSON file will not be created.")
            return

        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(self.results, f, ensure_ascii=False, indent=4)
            logger.info(f"Saved {len(self.results)} jobs to {filename}")
        except Exception as e:
            logger.error(f"Error writing to {filename}: {e}")
    
    def clear_results(self):
        self.results = []

if __name__ == "__main__":
    scraper = JobScraper()
    
    job_titles = [
        "Frontend Engineer", 
        "Backend Engineer", 
        "Software Engineer",
        "Full Stack Developer",
        "DevOps Engineer",
        "Data Scientist",
        "Machine Learning Engineer",
        "UI/UX Designer",
        "Product Manager",
        "QA Engineer"
    ]
    
    locations = [
        "Bangalore", 
        "Mumbai", 
        "Delhi", 
        "Pune", 
        "Hyderabad", 
        "Noida"
    ]
    
    scraper.scrape_linkedin(keywords=job_titles, locations=locations)
    scraper.save_to_json()
    
    logger.info(f"Total jobs found: {len(scraper.results)}")

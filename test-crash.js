import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:3000');
  
  // Wait for the app to load
  await new Promise(r => setTimeout(r, 2000));
  
  // Login or bypass auth if needed?
  // Wait, if we are not logged in, we are on the auth page.
  // The user had this crash AFTER login.
  // Let's execute some JS to bypass login or trigger login.
  await page.evaluate(() => {
    // Assuming we can trigger login via setting localStorage or similar?
    // Let's just click login button if it exists
    const inputs = document.querySelectorAll('input');
    if (inputs.length >= 2) {
      inputs[0].value = 'test@example.com';
      inputs[1].value = 'password';
      const btns = document.querySelectorAll('button');
      if (btns.length > 0) btns[0].click();
    }
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Click Profile button
  const profileBtn = await page.$('#sidebar-item-profile');
  if (profileBtn) {
    console.log('Clicking Profile button...');
    await profileBtn.click();
  } else {
    console.log('Profile button not found!');
  }
  
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();

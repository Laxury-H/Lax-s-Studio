const query = "tình hình kinh tế ngày 31/5/2026";
fetch('https://html.duckduckgo.com/html/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  },
  body: 'q=' + encodeURIComponent(query)
}).then(r=>r.text()).then(html => {
  const regex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  const results = [];
  while ((match = regex.exec(html)) !== null && results.length < 3) {
    results.push(match[1].replace(/<[^>]+>/g, '').trim());
  }
  console.log("Results:");
  console.log(results);
});

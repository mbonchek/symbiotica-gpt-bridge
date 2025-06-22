const axios = require('axios');

const BASE_URL = 'https://symbiotica-gpt-bridge.onrender.com';

const endpoints = [
  { method: 'post', path: '/get-page' },
  { method: 'post', path: '/write-to-page' },
  { method: 'get',  path: '/list-pages' },
  { method: 'post', path: '/search-pages' },
  { method: 'post', path: '/create-page' },
  { method: 'post', path: '/summarize-page' },
  { method: 'post', path: '/submit-idea' },
  { method: 'get',  path: '/help' },
  { method: 'post', path: '/update-block' },
  { method: 'post', path: '/create-database' },
  { method: 'post', path: '/add-database-entry' },
  { method: 'post', path: '/query-database' },
  { method: 'post', path: '/weekly-summary' },
  { method: 'post', path: '/log-help-entry' },
];

(async () => {
  for (const { method, path } of endpoints) {
    try {
      const url = `${BASE_URL}${path}`;
      const response = await axios({ method, url });
      console.log(`✅ ${method.toUpperCase()} ${path} → ${response.status}`);
    } catch (err) {
      console.log(`❌ ${method.toUpperCase()} ${path} → ${err.response?.status || 'No response'}`);
    }
  }
})();
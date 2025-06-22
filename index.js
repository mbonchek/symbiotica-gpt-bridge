const express = require('express');
const axios = require('axios');
require('dotenv').config();
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const notion = axios.create({
  baseURL: 'https://api.notion.com/v1/',
  headers: {
    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  }
});

// Get a page by title (search)
app.post('/get-page', async (req, res) => {
  console.log('📥 Received request:', req.body);

  const { title } = req.body;

  try {
    const search = await notion.post('/search', {
      query: title,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    });

    const page = search.data.results.find(p => p.object === 'page');

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const blocksRes = await notion.get(`/blocks/${page.id}/children?page_size=50`);
    const blocks = blocksRes.data.results;

    const textContent = blocks
      .filter(b => b.type === 'paragraph' && b.paragraph?.rich_text?.length)
      .map(b => b.paragraph.rich_text.map(r => r.plain_text).join(''))
      .join('\n\n');

    res.json({
      page_id: page.id,
      title: title,
      content: textContent || '[No paragraph content found on page]',
    });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Error retrieving Notion content' });
  }
});

app.post('/write-to-page', async (req, res) => {
  const { page_id, new_content } = req.body;

  try {
    const response = await notion.patch(`/blocks/${page_id}/children`, {
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: new_content
                }
              }
            ]
          }
        }
      ]
    });

    res.json({ success: true, result: response.data });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to write to Notion' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Symbiotica GPT Bridge running on http://localhost:${PORT}`);
});

// List all accessible pages
app.get('/list-pages', async (req, res) => {
  try {
    const response = await notion.post('/search', {
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 25
    });

    const pages = response.data.results
      .filter(p => p.object === 'page')
      .map(p => ({
        page_id: p.id,
        title: p.properties?.title?.title?.[0]?.plain_text || "Untitled"
      }));

    res.json({ pages });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to list Notion pages' });
  }
});

// Search for pages by query string
app.post('/search-pages', async (req, res) => {
  const { query } = req.body;

  try {
    const response = await notion.post('/search', {
      query,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 25
    });

    const results = response.data.results
      .filter(p => p.object === 'page')
      .map(p => ({
        page_id: p.id,
        title: p.properties?.title?.title?.[0]?.plain_text || "Untitled"
      }));

    res.json({ results });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Search failed' });
  }
});
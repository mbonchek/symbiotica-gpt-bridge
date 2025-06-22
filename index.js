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


app.listen(3000, () => {
  console.log('Symbiotica GPT Bridge running on http://localhost:3000');
});
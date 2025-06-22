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

app.post('/create-page', async (req, res) => {
  const { title, parent_page_id, content } = req.body;

  try {
    const response = await notion.post('/pages', {
      parent: { page_id: parent_page_id },
      properties: {
        title: [{
          type: 'text',
          text: { content: title }
        }]
      },
      children: content ? [{
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: content }
          }]
        }
      }] : []
    });

    res.json({ success: true, page_id: response.data.id });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to create Notion page' });
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

// --- Phase 1 Expanded Endpoints ---

// Update a block by ID
app.post('/update-block', async (req, res) => {
  const { block_id, new_text } = req.body;
  try {
    const response = await notion.patch(`/blocks/${block_id}`, {
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: new_text } }
        ]
      }
    });
    res.json({ success: true, result: response.data });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to update block' });
  }
});

// Summarize a page and write the summary
app.post('/summarize-page', async (req, res) => {
  const { page_id } = req.body;
  try {
    const blocks = await notion.get(`/blocks/${page_id}/children?page_size=100`);
    const fullText = blocks.data.results
      .filter(b => b.type === 'paragraph')
      .map(b => b.paragraph?.rich_text?.[0]?.plain_text || "")
      .join("\n");

    const completion = await openai.createChatCompletion({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Summarize this Notion page into key insights in paragraph form.' },
        { role: 'user', content: fullText }
      ]
    });

    const summary = completion.data.choices[0].message.content;

    const response = await notion.post('/pages', {
      parent: { page_id },
      properties: {
        title: { title: [{ type: 'text', text: { content: 'Summary of Page' } }] }
      },
      children: [{
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: summary } }]
        }
      }]
    });

    res.json({ success: true, summary, page_id: response.data.id });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to summarize or write to Notion' });
  }
});

// Create a new Notion database
app.post('/create-database', async (req, res) => {
  const { parent_page_id, title, properties } = req.body;
  try {
    const response = await notion.post('/databases', {
      parent: { page_id: parent_page_id },
      title: [{ type: 'text', text: { content: title }}],
      properties
    });
    res.json({ success: true, db_id: response.data.id });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to create database' });
  }
});

// Add entry to database
app.post('/add-database-entry', async (req, res) => {
  const { database_id, properties } = req.body;
  try {
    const response = await notion.post('/pages', {
      parent: { database_id },
      properties
    });
    res.json({ success: true, entry_id: response.data.id });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to add entry' });
  }
});

// Query database by filter
app.post('/query-database', async (req, res) => {
  const { database_id, filter } = req.body;
  try {
    const response = await notion.post(`/databases/${database_id}/query`, { filter });
    res.json({ results: response.data.results });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to query database' });
  }
});

// Submit an idea to the "inbox"
app.post('/submit-idea', async (req, res) => {
  const { database_id, idea } = req.body;
  try {
    const response = await notion.post('/pages', {
      parent: { database_id },
      properties: {
        Name: {
          title: [{ type: 'text', text: { content: idea } }]
        }
      }
    });
    res.json({ success: true, entry_id: response.data.id });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to submit idea' });
  }
});

// Weekly summary endpoint (placeholder)
app.get('/weekly-summary', async (req, res) => {
  // This would eventually query edited pages or a log DB
  res.json({ summary: "This is where your weekly digest would go. Summaries of page edits, new entries, and trends." });
});

app.get('/help', async (req, res) => {
  try {
    const HELP_PAGE_ID = process.env.HELP_PAGE_ID;

    const blocks = await notion.get(`/blocks/${HELP_PAGE_ID}/children?page_size=100`);
    const content = blocks.data.results
      .filter(b => b.type === 'paragraph')
      .map(b => b.paragraph?.rich_text?.map(rt => rt.plain_text).join('') || "")
      .join('\n');

    res.json({ source: "notion", help_content: content });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to read Help page from Notion' });
  }
});

app.post('/log-help-entry', async (req, res) => {
  const { name, endpoint, description, category, example_prompt, auto_generated } = req.body;

  try {
    const response = await notion.post('/pages', {
      parent: { database_id: process.env.HELP_DB_ID },
      properties: {
        Name: {
          title: [{ type: 'text', text: { content: name } }]
        },
        Endpoint: {
          rich_text: [{ type: 'text', text: { content: endpoint } }]
        },
        Description: {
          rich_text: [{ type: 'text', text: { content: description } }]
        },
        Category: {
          select: { name: category }
        },
        "Example Prompt": {
          rich_text: [{ type: 'text', text: { content: example_prompt } }]
        },
        AutoGenerated: {
          checkbox: auto_generated
        }
      }
    });

    res.json({ success: true, id: response.data.id });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to log help entry to Notion' });
  }
});
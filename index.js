// index.js

const express = require('express');
const { Client } = require('@notionhq/client');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// 🔧 Utility: Get or create a page in a linked database
async function getOrCreateEntityByName(name, dbId) {
  const search = await notion.databases.query({
    database_id: dbId,
    filter: {
      property: 'Name',
      title: { equals: name }
    }
  });

  if (search.results.length > 0) return search.results[0].id;

  const created = await notion.pages.create({
    parent: { database_id: dbId },
    properties: {
      Name: { title: [{ text: { content: name } }] }
    }
  });

  return created.id;
}

// 🔧 Utility: Format and extend multi-select options
async function formatMultiSelectOptions(values, dbId, fieldName) {
  const schema = await notion.databases.retrieve({ database_id: dbId });
  const existingOptions = schema.properties[fieldName]?.multi_select?.options.map(opt => opt.name) || [];

  return values.map(name => ({ name }));
}

// ✅ Endpoint: Submit Article with relations and tags
app.post('/submit-article', async (req, res) => {
  const {
    title,
    url,
    summary,
    type,
    topics = [],
    authors = [],
    organizations = [],
    events = [],
    publishedDate,
    source
  } = req.body;

  try {
    const articleDbId = process.env.ARTICLES_DB_ID;

    const authorIds = await Promise.all(authors.map(name => getOrCreateEntityByName(name, process.env.PEOPLE_DB_ID)));
    const orgIds = await Promise.all(organizations.map(name => getOrCreateEntityByName(name, process.env.ORGS_DB_ID)));
    const eventIds = await Promise.all(events.map(name => getOrCreateEntityByName(name, process.env.EVENTS_DB_ID)));

    const formattedTopics = await formatMultiSelectOptions(topics, articleDbId, 'Topics');
    const formattedType = type ? [{ name: type }] : [];

    const newPage = await notion.pages.create({
      parent: { database_id: articleDbId },
      properties: {
        Name: {
          title: [{ text: { content: title } }]
        },
        'Source URL': {
          url: url
        },
        Summary: {
          rich_text: [{ text: { content: summary || '' } }]
        },
        Type: {
          multi_select: formattedType
        },
        Topics: {
          multi_select: formattedTopics
        },
        Authors: {
          relation: authorIds.map(id => ({ id }))
        },
        Organizations: {
          relation: orgIds.map(id => ({ id }))
        },
        Events: {
          relation: eventIds.map(id => ({ id }))
        },
        'Published Date': publishedDate
          ? { date: { start: publishedDate } }
          : undefined,
        Source: {
          rich_text: [{ text: { content: source || '' } }]
        }
      }
    });

    res.json({ status: 'success', pageId: newPage.id });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: 'Failed to submit article', details: error.message });
  }
});

// 🔁 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Symbiotica GPT Bridge running on http://localhost:${PORT}`);
});
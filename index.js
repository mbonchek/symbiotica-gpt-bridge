// index.js

const express = require('express');
const { Client } = require('@notionhq/client');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Symbiotica GPT Bridge running on http://localhost:${PORT}`);
});

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
    const notion = new Client({ auth: process.env.NOTION_TOKEN });
    const dbId = process.env.ARTICLES_DB_ID;
  
    const { title, url, summary, authors, type, topics, organizations, people, events } = req.body;
  
    try {
      // Fetch database properties
      const db = await notion.databases.retrieve({ database_id: dbId });
      const props = db.properties;
  
      const properties = {};
  
      // Always include title (Notion requires a title field)
      if (props["Name"]) {
        properties["Name"] = {
          title: [
            {
              text: { content: title || "Untitled Article" }
            }
          ]
        };
      }
  
      if (url && props["Source URL"] && props["Source URL"].type === "url") {
        properties["Source URL"] = { url };
      }
  
      if (summary && props["Summary"] && props["Summary"].type === "rich_text") {
        properties["Summary"] = {
          rich_text: [{ text: { content: summary } }]
        };
      }
  
      if (authors && props["Authors"] && props["Authors"].type === "multi_select") {
        properties["Authors"] = {
          multi_select: authors.map(name => ({ name }))
        };
      }
  
      if (type && props["Type"] && props["Type"].type === "select") {
        properties["Type"] = { select: { name: type } };
      }
  
      if (topics && props["Topics"] && props["Topics"].type === "multi_select") {
        properties["Topics"] = {
          multi_select: topics.map(t => ({ name: t }))
        };
      }
  
      if (organizations && props["Organizations"] && props["Organizations"].type === "relation") {
        properties["Organizations"] = {
          relation: organizations.map(id => ({ id }))
        };
      }
  
      if (people && props["People"] && props["People"].type === "relation") {
        properties["People"] = {
          relation: people.map(id => ({ id }))
        };
      }
  
      if (events && props["Events"] && props["Events"].type === "relation") {
        properties["Events"] = {
          relation: events.map(id => ({ id }))
        };
      }
  
      // Create the page
      const newPage = await notion.pages.create({
        parent: { database_id: dbId },
        properties
      });
  
      res.json({ status: "success", pageId: newPage.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Failed to submit article",
        details: err.message
      });
    }
  });

  const unfluff = require('unfluff');


// ✅ Endpoint: Parse Article 
app.post('/parse-article', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Step 1: Fetch raw HTML
    const html = await axios.get(url).then(r => r.data);

    // Step 2: Extract article content
    const parsed = unfluff(html);

    const articleText = parsed.text?.slice(0, 6000); // limit for GPT
    const rawTitle = parsed.title;
    const rawAuthor = parsed.author;

    // Step 3: Use GPT to generate structured summary
    const openaiRes = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a content analyst that extracts structured data from articles."
          },
          {
            role: "user",
            content: `Here is an article. Extract the following: title, author, summary, topics (as keywords), type (e.g. news, opinion, research). Then return it as JSON.

Title: ${rawTitle}
Author: ${rawAuthor}
Content:
${articleText}`
          }
        ],
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const structured = openaiRes.data.choices?.[0]?.message?.content;

    res.json({ parsed, structured });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to parse and analyze article',
      details: err.message
    });
  }
});
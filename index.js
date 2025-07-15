const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const archiver = require("archiver");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

async function scrapePosts(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    let posts = [];

    $("article a").each((i, el) => {
      if (posts.length >= 3) return false;
      const title = $(el).text().trim();
      let link = $(el).attr("href");
      if (title && link) {
        if (link.startsWith("/")) {
          const base = new URL(url);
          link = base.origin + link;
        }
        posts.push({ title, link });
      }
    });

    if (posts.length === 0) {
      posts = [
        { title: "Sample Post 1", link: "#" },
        { title: "Sample Post 2", link: "#" },
        { title: "Sample Post 3", link: "#" },
      ];
    }

    return posts;
  } catch (err) {
    console.error("Scraping error:", err.message);
    return [
      { title: "Sample Post 1", link: "#" },
      { title: "Sample Post 2", link: "#" },
      { title: "Sample Post 3", link: "#" },
    ];
  }
}

app.post("/generate-template", upload.single("logo"), async (req, res) => {
  const { title, address = "", phone = "", email = "", scrapeUrl } = req.body;

  if (!title || !scrapeUrl) {
    return res.status(400).json({ error: "Title and scrapeUrl are required" });
  }

  let logoBase64 = "";
  if (req.file) {
    logoBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString(
      "base64"
    )}`;
  }

  const posts = await scrapePosts(scrapeUrl);

  const tempDir = path.join(__dirname, "temp-react-template");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const appJs = `
import React from 'react';

const posts = ${JSON.stringify(posts)};
const logo = "${logoBase64}";

export default function App() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {logo && <img src={logo} alt="Logo" style={{ height: 60 }} />}
        <div>
          <h1>${title}</h1>
          <p>Contact: ${phone} | ${email}</p>
          <address>${address}</address>
        </div>
      </header>

      <section>
        <h2>Latest Posts</h2>
        <ul>
          {posts.map((post, idx) => (
            <li key={idx}>
              <a href={post.link} target="_blank" rel="noopener noreferrer">{post.title}</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
`;

  const packageJson = {
    name: "generated-react-template",
    version: "1.0.0",
    private: true,
    dependencies: {
      react: "^18.2.0",
      "react-dom": "^18.2.0",
      "react-scripts": "5.0.1",
    },
    scripts: {
      start: "react-scripts start",
      build: "react-scripts build",
      test: "react-scripts test",
      eject: "react-scripts eject",
    },
  };

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "App.js"), appJs);
  fs.writeFileSync(
    path.join(tempDir, "src", "index.js"),
    `
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
`
  );
  fs.mkdirSync(path.join(tempDir, "public"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "public", "index.html"),
    `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>
`
  );

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    \`attachment; filename=\${title.toLowerCase().replace(/\\s+/g, "-")}-template.zip\`
  );

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(tempDir, false);
  archive.finalize();
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));

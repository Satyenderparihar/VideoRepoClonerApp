const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

const PORT = process.env.PORT || 5050;
const PROJECTS_DIR = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'repositories.json');
const CATALOG_MD = path.join(__dirname, '⚡_Cloned_Repositories_Directory.md');

// Ensure uploads folder exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Read local DB
function getDB() {
  if (!fs.existsSync(DB_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  syncMarkdownDirectory(data);
}

// Rebuild Markdown Directory
function syncMarkdownDirectory(allRepos) {
  const categories = {
    '🤖 AI & Machine Learning': [],
    '📱 Android Power Tools & APKs': [],
    '💻 APIs, Backend & Programming': [],
    '📈 Trading & Financial Tools': [],
    '🚀 Social, Growth & Utilities': [],
    '✨ Other Repositories': []
  };

  for (const item of Object.values(allRepos)) {
    const cat = item.category || '✨ Other Repositories';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  }

  const lines = [
    '# ⚡ Cloned & Categorized Repositories Directory',
    '',
    `> **Last Synced:** ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST  `,
    `> **Total Managed Repositories:** ${Object.keys(allRepos).length}  `,
    `> **GitHub Account:** [Satyenderparihar](https://github.com/Satyenderparihar)  `,
    '',
    '---',
    ''
  ];

  for (const [catName, list] of Object.entries(categories)) {
    if (list.length === 0) continue;
    lines.push(`## ${catName}`);
    lines.push('');
    lines.push('| Repo Name | Stars | Description | Original | Your GitHub Fork | Action |');
    lines.push('|:---|:---:|:---|:---:|:---:|:---:|');
    for (const r of list) {
      const star = r.stars ? `⭐ ${Number(r.stars).toLocaleString()}` : '-';
      const desc = (r.description || '').replace(/\|/g, '-').slice(0, 80);
      lines.push(`| **[${r.name}](${r.originalUrl || r.url})** | ${star} | ${desc} | [Original](${r.originalUrl || r.url}) | [🚀 Satyenderparihar](${r.userRepoUrl}) | [Local Cloned] |`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  try {
    fs.writeFileSync(CATALOG_MD, lines.join('\n'), 'utf8');
  } catch (e) {
    console.error('[!] Failed writing catalog markdown:', e.message);
  }
}

// Category classification
function classifyRepo(name, description = '', topics = []) {
  const combined = `${name} ${description} ${topics.join(' ')}`.toLowerCase();
  if (/android|apk|patcher|komi|diplay|morphe|carplay|termux/i.test(combined)) {
    return '📱 Android Power Tools & APKs';
  }
  if (/ai|llm|gpt|openai|machine-learning|deep-learning|diffusion|langchain|ollama|agent/i.test(combined)) {
    return '🤖 AI & Machine Learning';
  }
  if (/trading|stock|market|crypto|finance|forex|quant|algo/i.test(combined)) {
    return '📈 Trading & Financial Tools';
  }
  if (/api|apis|backend|server|node|python|javascript|typescript|library|database|sql/i.test(combined)) {
    return '💻 APIs, Backend & Programming';
  }
  if (/social|growth|reels|youtube|video|instagram|telegram|bot|utility|tools/i.test(combined)) {
    return '🚀 Social, Growth & Utilities';
  }
  return '✨ Other Repositories';
}

// Execute CLI promise
function runCmd(command, cwd = PROJECTS_DIR) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return resolve({ success: false, error: stderr || err.message, stdout, stderr });
      }
      resolve({ success: true, stdout, stderr });
    });
  });
}

// Extract GitHub repo pattern from text
function extractGitHubUrls(text) {
  if (!text) return [];
  const regex = /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/gi;
  const matches = [];
  const ignored = new Set(['topics', 'trending', 'features', 'pricing', 'explore', 'marketplace', 'settings', 'notifications', 'site', 'about']);

  let m;
  while ((m = regex.exec(text)) !== null) {
    const owner = m[1].trim();
    const name = m[2].trim().replace(/\.git$/i, '').replace(/[?#].*$/, '');
    if (!ignored.has(owner.toLowerCase()) && !matches.some(x => x.owner.toLowerCase() === owner.toLowerCase() && x.name.toLowerCase() === name.toLowerCase())) {
      matches.push({ owner, name, fullName: `${owner}/${name}`, url: `https://github.com/${owner}/${name}` });
    }
  }
  return matches;
}

// Fetch GitHub repo metadata
async function getRepoMetadata(owner, name) {
  const ghRes = await runCmd(`gh repo view "${owner}/${name}" --json name,description,stargazerCount,repositoryTopics,url,owner,defaultBranchRef,isArchived,licenseInfo`);
  if (ghRes.success) {
    try {
      const data = JSON.parse(ghRes.stdout);
      return {
        name: data.name || name,
        owner: data.owner?.login || owner,
        fullName: `${owner}/${name}`,
        description: data.description || 'No description provided.',
        stars: data.stargazerCount || 0,
        topics: (data.repositoryTopics || []).map(t => (typeof t === 'string' ? t : t.name)),
        url: data.url || `https://github.com/${owner}/${name}`,
        license: data.licenseInfo?.spdxId || null
      };
    } catch (e) {}
  }
  return {
    name,
    owner,
    fullName: `${owner}/${name}`,
    description: 'No description available.',
    stars: 0,
    topics: [],
    url: `https://github.com/${owner}/${name}`,
    license: null
  };
}

// Scan video URL using yt-dlp & search
async function scanUrlForRepos(targetUrl) {
  const directMatches = extractGitHubUrls(targetUrl);
  if (directMatches.length > 0) {
    const results = [];
    for (const m of directMatches) {
      const meta = await getRepoMetadata(m.owner, m.name);
      results.push({ ...meta, category: classifyRepo(meta.name, meta.description, meta.topics) });
    }
    return { success: true, source: 'direct_url', repos: results };
  }

  // Use yt-dlp to inspect video metadata
  console.log(`[*] Running yt-dlp metadata scan on: ${targetUrl}`);
  const ytdlpRes = await runCmd(`yt-dlp -j --skip-download --no-warnings "${targetUrl}"`);
  let metadataText = '';
  let videoTitle = '';
  let videoDesc = '';

  if (ytdlpRes.success && ytdlpRes.stdout.trim()) {
    try {
      const v = JSON.parse(ytdlpRes.stdout);
      videoTitle = v.title || '';
      videoDesc = v.description || '';
      metadataText = `${videoTitle}\n${videoDesc}\n${(v.tags || []).join(' ')}`;
    } catch (e) {
      metadataText = ytdlpRes.stdout;
    }
  }

  const foundRepos = extractGitHubUrls(metadataText);
  if (foundRepos.length > 0) {
    const results = [];
    for (const m of foundRepos) {
      const meta = await getRepoMetadata(m.owner, m.name);
      results.push({ ...meta, category: classifyRepo(meta.name, meta.description, meta.topics) });
    }
    return { success: true, source: 'video_metadata', videoTitle, repos: results };
  }

  // If no direct link, extract candidates from title
  const cleanTitle = videoTitle.replace(/[^\w\s-]/gi, ' ').trim();
  const searchTerms = cleanTitle.split(/\s+/).filter(w => w.length > 3 && !['video', 'full', 'tutorial', 'android', 'phone', 'with'].includes(w.toLowerCase()));

  if (searchTerms.length > 0) {
    const query = searchTerms.slice(0, 3).join(' ');
    console.log(`[*] Searching GitHub for title terms: "${query}"`);
    const searchRes = await runCmd(`gh api "search/repositories?q=${encodeURIComponent(query)}&per_page=5&sort=stars"`);
    if (searchRes.success) {
      try {
        const sdata = JSON.parse(searchRes.stdout);
        const candidates = (sdata.items || []).map(item => ({
          name: item.name,
          owner: item.owner?.login,
          fullName: item.full_name,
          description: item.description || '',
          stars: item.stargazers_count || 0,
          topics: item.topics || [],
          url: item.html_url,
          category: classifyRepo(item.name, item.description, item.topics || []),
          confidence: 'suggested_search'
        }));
        if (candidates.length > 0) {
          return { success: true, source: 'search_fallback', videoTitle, repos: candidates };
        }
      } catch (e) {}
    }
  }

  return { success: false, error: 'No GitHub repository link or identifiable tool found in video.', videoTitle };
}

// Clone & Fork repository
async function cloneAndForkRepo(owner, name) {
  const fullName = `${owner}/${name}`;
  const localTarget = path.join(PROJECTS_DIR, name);
  const targetUserRepo = `Satyenderparihar/${name}`;
  const userRepoUrl = `https://github.com/${targetUserRepo}`;

  console.log(`[*] Forking and cloning ${fullName}...`);

  // 1. Fork via gh CLI
  const forkRes = await runCmd(`gh repo fork "${fullName}" --clone=false`);
  console.log(`[+] Fork result:`, forkRes.stdout || forkRes.stderr);

  // 2. Clone locally into projects/ if not already present
  if (!fs.existsSync(localTarget)) {
    console.log(`[*] Cloning to ${localTarget}...`);
    await runCmd(`git clone "https://github.com/${targetUserRepo}.git" "${name}"`, PROJECTS_DIR);
  } else {
    console.log(`[*] Local directory ${name} already exists. Pulling latest...`);
    await runCmd(`git pull origin main || git pull origin master`, localTarget);
  }

  // 3. Metadata
  const meta = await getRepoMetadata(owner, name);
  const category = classifyRepo(meta.name, meta.description, meta.topics);

  // 4. Save to DB
  const db = getDB();
  db[fullName.toLowerCase()] = {
    ...meta,
    category,
    originalUrl: `https://github.com/${fullName}`,
    userRepoUrl,
    localPath: localTarget,
    clonedAt: new Date().toISOString()
  };
  saveDB(db);

  return {
    success: true,
    name,
    owner,
    fullName,
    category,
    userRepoUrl,
    localPath: localTarget,
    stars: meta.stars,
    description: meta.description
  };
}

// Delete repository from GitHub & local storage
async function deleteRepository(name) {
  const targetUserRepo = `Satyenderparihar/${name}`;
  const localTarget = path.join(PROJECTS_DIR, name);
  const logs = [];

  console.log(`[*] Deleting repository: ${targetUserRepo}`);

  // 1. Delete from GitHub
  const ghDel = await runCmd(`gh repo delete "${targetUserRepo}" --yes`);
  if (ghDel.success) {
    logs.push(`✓ Deleted ${targetUserRepo} from GitHub.`);
  } else {
    logs.push(`⚠️ GitHub deletion note: ${ghDel.error || 'Check repo or delete_repo permissions'}`);
  }

  // 2. Delete local folder if exists
  if (fs.existsSync(localTarget)) {
    try {
      fs.rmSync(localTarget, { recursive: true, force: true });
      logs.push(`✓ Deleted local directory: ${localTarget}`);
    } catch (e) {
      logs.push(`⚠️ Local folder delete error: ${e.message}`);
    }
  }

  // 3. Remove from DB
  const db = getDB();
  let foundKey = null;
  for (const k of Object.keys(db)) {
    if (db[k].name?.toLowerCase() === name.toLowerCase()) {
      foundKey = k;
      break;
    }
  }
  if (foundKey) {
    delete db[foundKey];
    saveDB(db);
    logs.push(`✓ Removed from local catalog database.`);
  }

  // 4. Re-sync profile catalog
  const catalogScript = path.join(PROJECTS_DIR, 'Satyenderparihar', 'scripts', 'auto_catalog.js');
  if (fs.existsSync(catalogScript)) {
    runCmd(`node scripts/auto_catalog.js`, path.join(PROJECTS_DIR, 'Satyenderparihar')).catch(() => {});
  }

  return { success: true, logs: logs.join('\n') };
}

// Parse Multipart Stream for file upload
function handleFileUpload(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:["']?)([^"';]+)/i);
    if (!boundaryMatch) return reject(new Error('Invalid multipart boundary'));

    const boundary = boundaryMatch[1];
    const timestamp = Date.now();
    let fileName = `upload_${timestamp}.mp4`;
    const targetFile = path.join(UPLOADS_DIR, fileName);
    const writeStream = fs.createWriteStream(targetFile);

    let headerParsed = false;
    let buffer = Buffer.alloc(0);

    req.on('data', chunk => {
      if (!headerParsed) {
        buffer = Buffer.concat([buffer, chunk]);
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const headerText = buffer.slice(0, headerEnd).toString('utf8');
          const fnMatch = headerText.match(/filename="([^"]+)"/i);
          if (fnMatch) {
            fileName = `${timestamp}_${fnMatch[1].replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
          }
          headerParsed = true;
          const bodyStart = buffer.slice(headerEnd + 4);
          writeStream.write(bodyStart);
          buffer = null;
        }
      } else {
        writeStream.write(chunk);
      }
    });

    req.on('end', () => {
      writeStream.end();
      resolve({ filePath: targetFile, fileName });
    });

    req.on('error', err => {
      writeStream.destroy();
      reject(err);
    });
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // JSON Body Helper
  const readJson = () => new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { resolve({}); }
    });
  });

  const sendJson = (data, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  // API Routes
  if (pathname === '/api/repos' && req.method === 'GET') {
    // List cloned repos from DB and local directory
    const db = getDB();
    const list = Object.values(db);
    return sendJson({ success: true, repos: list, count: list.length });
  }

  if (pathname === '/api/scan' && req.method === 'POST') {
    const { url } = await readJson();
    if (!url || !url.trim()) return sendJson({ success: false, error: 'URL is required' }, 400);

    console.log(`[*] API Scan requested for: ${url}`);
    const result = await scanUrlForRepos(url.trim());
    return sendJson(result);
  }

  if (pathname === '/api/clone' && req.method === 'POST') {
    const { owner, name, repoUrl } = await readJson();
    let targetOwner = owner;
    let targetName = name;

    if (!targetOwner || !targetName) {
      const match = (repoUrl || '').match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
      if (match) {
        targetOwner = match[1];
        targetName = match[2].replace(/\.git$/i, '');
      }
    }

    if (!targetOwner || !targetName) {
      return sendJson({ success: false, error: 'Valid repository owner and name are required' }, 400);
    }

    try {
      const result = await cloneAndForkRepo(targetOwner, targetName);
      return sendJson(result);
    } catch (e) {
      return sendJson({ success: false, error: e.message }, 500);
    }
  }

  if (pathname.startsWith('/api/repos/') && req.method === 'DELETE') {
    const name = decodeURIComponent(pathname.replace('/api/repos/', '').trim());
    if (!name) return sendJson({ success: false, error: 'Repository name required' }, 400);

    const result = await deleteRepository(name);
    return sendJson(result);
  }

  if (pathname === '/api/upload' && req.method === 'POST') {
    try {
      const { filePath, fileName } = await handleFileUpload(req);
      const stats = fs.statSync(filePath);
      const sizeMb = (stats.size / 1024 / 1024).toFixed(1);

      console.log(`[✓] Uploaded video file: ${fileName} (${sizeMb} MB) to ${filePath}`);

      // Inspect filename keywords for repo search
      const cleanName = fileName.replace(/upload_\d+_?|\.mp4|\.mov|\.mkv|\.webm/gi, '').replace(/[_-]/g, ' ').trim();
      let detectedRepos = [];

      if (cleanName.length > 2) {
        const searchRes = await runCmd(`gh api "search/repositories?q=${encodeURIComponent(cleanName)}&per_page=5&sort=stars"`);
        if (searchRes.success) {
          try {
            const sdata = JSON.parse(searchRes.stdout);
            detectedRepos = (sdata.items || []).map(item => ({
              name: item.name,
              owner: item.owner?.login,
              fullName: item.full_name,
              description: item.description || '',
              stars: item.stargazers_count || 0,
              topics: item.topics || [],
              url: item.html_url,
              category: classifyRepo(item.name, item.description, item.topics || [])
            }));
          } catch (e) {}
        }
      }

      return sendJson({
        success: true,
        fileName,
        sizeMb: `${sizeMb} MB`,
        filePath,
        detectedRepos
      });
    } catch (e) {
      console.error('[!] Video upload failed:', e.message);
      return sendJson({ success: false, error: e.message }, 500);
    }
  }

  if (pathname === '/api/system' && req.method === 'GET') {
    const ghCheck = await runCmd('gh auth status');
    return sendJson({
      status: 'online',
      nodeVersion: process.version,
      projectsDir: PROJECTS_DIR,
      githubConnected: ghCheck.success
    });
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  const contentType = mimeTypes[ext] || 'text/plain';
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Video-to-Repo Android App Server Running!`);
  console.log(`📱 Local Access:   http://localhost:${PORT}`);
  console.log(`🌐 IPv4 Access:    http://127.0.0.1:${PORT}`);
  console.log(`📁 Projects Path:  ${PROJECTS_DIR}`);
  console.log(`======================================================\n`);
});

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const PROJECTS_DIR = path.join(__dirname, 'deployments');

if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Sunucu tarafında tutulan durumlar
let userPlan = 'free'; // 'free' veya 'pro'
const projects = {};

// Kontrol Paneli Arayüzü (HTML)
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="tr" class="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Gerçek Mini-PaaS Paneli</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>tailwind.config = { darkMode: 'class' }</script>
    </head>
    <body class="bg-zinc-950 text-zinc-100 min-h-screen font-sans">
        <nav class="border-b border-zinc-800 px-6 py-4 flex justify-between items-center bg-zinc-900/50 backdrop-blur">
            <div class="flex items-center space-x-3">
                <div class="bg-white text-black font-bold px-3 py-1 rounded text-sm">PaaS</div>
                <span class="font-semibold text-lg">Gerçek Dağıtım Motoru</span>
            </div>
            <div class="flex items-center space-x-4">
                <div id="plan-badge" class="text-xs px-3 py-1 rounded-full border font-medium">Yükleniyor...</div>
                <button id="upgrade-btn" onclick="upgradePlan()" class="hidden bg-gradient-to-r from-amber-500 to-orange-500 text-black font-semibold px-3 py-1.5 rounded-lg text-xs hover:opacity-90 transition">
                    ✨ Pro'ya Yükselt
                </button>
            </div>
        </nav>

        <main class="max-w-6xl mx-auto px-6 py-10">
            <div class="flex justify-between items-center mb-8">
                <div>
                    <h1 class="text-2xl font-bold tracking-tight">Sunucu Projeleri</h1>
                    <p id="project-limit-info" class="text-sm text-zinc-400 mt-1">Gerçek Git repolarınızı sunucuda derleyin.</p>
                </div>
                <button onclick="openModal()" class="bg-white text-black hover:bg-zinc-200 font-medium px-4 py-2 rounded-lg text-sm transition">
                    + Gerçek Proje Dağıt
                </button>
            </div>

            <div id="project-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
        </main>

        <div id="deploy-modal" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4">
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
                <h2 class="text-lg font-bold mb-4">Yeni Proje Ekle (Git URL)</h2>
                <form id="deploy-form" onsubmit="handleDeploy(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-medium text-zinc-400 mb-1">GitHub Repo URL (.git)</label>
                        <input type="text" id="repoUrl" required placeholder="https://github.com/kullanici/repo.git" class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 text-zinc-200">
                    </div>
                    <div class="flex justify-end space-x-2 pt-2">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 text-sm text-zinc-400 hover:text-white">İptal</button>
                        <button type="submit" class="bg-white text-black font-medium px-4 py-2 rounded-lg text-sm hover:bg-zinc-200 transition">Sunucuda Derle</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            function openModal() { document.getElementById('deploy-modal').classList.remove('hidden'); }
            function closeModal() { document.getElementById('deploy-modal').classList.add('hidden'); }

            async function fetchData() {
                const res = await fetch('/api/data');
                const data = await res.json();
                
                const badge = document.getElementById('plan-badge');
                const upgradeBtn = document.getElementById('upgrade-btn');
                const limitInfo = document.getElementById('project-limit-info');
                const projectKeys = Object.keys(data.projects);

                if (data.plan === 'free') {
                    badge.className = "text-xs px-3 py-1 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium";
                    badge.innerText = "Plan: Ücretsiz (Max 2 Proje)";
                    upgradeBtn.classList.remove('hidden');
                    limitInfo.innerText = \`Ücretsiz Plan: \${projectKeys.length}/2 proje kullanılıyor.\`;
                } else {
                    badge.className = "text-xs px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 font-medium";
                    badge.innerText = "⭐ Plan: Pro (Sınırsız)";
                    upgradeBtn.classList.add('hidden');
                    limitInfo.innerText = "Pro Plan: Sınırsız gerçek sunucu dağıtımı aktif.";
                }

                const listEl = document.getElementById('project-list');
                if (projectKeys.length === 0) {
                    listEl.innerHTML = \`<div class="col-span-full text-center py-12 border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-sm">Henüz sunucuda bir proje yok.</div>\`;
                    return;
                }

                listEl.innerHTML = projectKeys.map(name => {
                    const p = data.projects[name];
                    let statusColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                    if (p.status === 'Aktif') statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                    if (p.status.includes('Hata')) statusColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';

                    return \`
                        <div class="border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <h3 class="font-semibold text-base">\${name}</h3>
                                    <span class="text-xs px-2 py-0.5 rounded-full border \${statusColor}">\${p.status}</span>
                                </div>
                                <p class="text-xs text-zinc-400 truncate mb-4">\${p.url}</p>
                            </div>
                            <div class="flex justify-between items-center text-xs text-zinc-500 pt-3 border-t border-zinc-800/60">
                                <span>Son İşlem: \${p.lastDeploy}</span>
                                <button onclick="triggerDeploy('\${name}')" class="text-zinc-300 hover:text-white font-medium bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition">Yeniden Derle</button>
                            </div>
                        </div>
                    \`;
                }).join('');
            }

            async function handleDeploy(e) {
                e.preventDefault();
                const repoUrl = document.getElementById('repoUrl').value;
                closeModal();
                document.getElementById('repoUrl').value = '';

                const res = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ repoUrl })
                });
                const data = await res.json();
                if (!res.ok) alert(data.error);
                fetchData();
            }

            async function upgradePlan() {
                await fetch('/api/upgrade', { method: 'POST' });
                alert('Tebrikler! Pro plana geçtiniz.');
                fetchData();
            }

            async function triggerDeploy(name) {
                await fetch('/api/deploy-name', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                fetchData();
            }

            fetchData();
            setInterval(fetchData, 3000);
        </script>
    </body>
    </html>
    `);
});

// API: Durumları Getir
app.get('/api/data', (req, res) => {
    res.json({ plan: userPlan, projects });
});

// API: Pro Plan Yükseltme
app.post('/api/upgrade', (req, res) => {
    userPlan = 'pro';
    res.send({ success: true });
});

// API: Yeni Proje Klonla ve Build Al
app.post('/api/deploy', (req, res) => {
    const { repoUrl } = req.body;
    if (!repoUrl) return res.status(400).json({ error: 'Repo URL zorunludur.' });

    const repoName = repoUrl.split('/').pop().replace('.git', '') || 'proje';
    const currentCount = Object.keys(projects).length;

    if (userPlan === 'free' && currentCount >= 2 && !projects[repoName]) {
        return res.status(403).json({ error: 'Ücretsiz planda en fazla 2 proje çalıştırabilirsiniz. Pro plana geçin.' });
    }

    projects[repoName] = {
        url: repoUrl,
        status: 'Klonlanıyor...',
        lastDeploy: new Date().toLocaleTimeString()
    };

    res.json({ success: true });
    executeBuildPipeline(repoName, repoUrl);
});

// API: Yeniden Derle
app.post('/api/deploy-name', (req, res) => {
    const { name } = req.body;
    if (!projects[name]) return res.status(404).send('Proje bulunamadı');

    projects[name].status = 'Güncelleniyor...';
    projects[name].lastDeploy = new Date().toLocaleTimeString();

    res.json({ success: true });
    executeBuildPipeline(name, projects[name].url);
});

// Gerçek İşlem Motoru (Git Clone + NPM Install + Build)
function executeBuildPipeline(repoName, repoUrl) {
    const projectPath = path.join(PROJECTS_DIR, repoName);
    const gitCmd = fs.existsSync(projectPath)
        ? `cd "${projectPath}" && git pull`
        : `git clone "${repoUrl}" "${projectPath}"`;

    exec(gitCmd, (gitErr) => {
        if (gitErr) {
            projects[repoName].status = 'Hata (Git)';
            return;
        }

        projects[repoName].status = 'Derleniyor...';
        
        // Sunucuda gerçek bağımlılık yükleme ve derleme komutu
        const buildCmd = `cd "${projectPath}" && npm install && (npm run build --if-present)`;

        exec(buildCmd, (buildErr) => {
            if (buildErr) {
                projects[repoName].status = 'Hata (Build)';
                return;
            }
            projects[repoName].status = 'Aktif';
            projects[repoName].lastDeploy = new Date().toLocaleTimeString();
        });
    });
}

app.listen(PORT, () => {
    console.log(`Gerçek Mini-PaaS sunucusu ${PORT} portunda çalışıyor.`);
});

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Iyzipay = require('iyzipay');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const PROJECTS_DIR = path.join(__dirname, 'deployments');

if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

let userPlan = 'free'; // 'free' veya 'pro'
const projects = {};

// İyzico Yapılandırması (Test / Sandbox Bilgileri - Canlıya geçerken kendi anahtarlarınızı yazarsınız)
const iyzipay = new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY || 'sandbox-sizin-apikeyiniz',
    secretKey: process.env.IYZICO_SECRET_KEY || 'sandbox-sizin-secretkeyiniz',
    uri: 'https://sandbox-api.iyzipay.com' // Canlı ortam için: https://api.iyzipay.com
});

// 1. STATİK SİTELERİ INTERNETTE YAYINLAMA MOTORU (Middleware)
app.use('/preview/:name', (req, res, next) => {
    const name = req.params.name;
    const p = projects[name];
    
    if (!p || p.status !== 'Aktif') {
        return res.status(404).send(`
            <body style="background:#09090b;color:#a1a1aa;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
                <div style="text-align:center;">
                    <h2 style="color:#f43f5e;">Proje Henüz Yayında Değil</h2>
                    <p>Bu site henüz derlenmedi veya aktif değil.</p>
                </div>
            </body>
        `);
    }

    const projectPath = path.join(PROJECTS_DIR, name);
    let targetDir = projectPath;
    if (fs.existsSync(path.join(projectPath, 'dist'))) {
        targetDir = path.join(projectPath, 'dist');
    } else if (fs.existsSync(path.join(projectPath, 'build'))) {
        targetDir = path.join(projectPath, 'build');
    }

    req.url = req.url.replace('/preview/' + name, '');
    if (req.url === '' || req.url === '/') {
        req.url = '/index.html';
    }

    express.static(targetDir)(req, res, next);
});

// 2. KONTROL PANELİ ARAYÜZÜ
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="tr" class="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Web Sitesi Dağıtıcısı - Mini-PaaS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>tailwind.config = { darkMode: 'class' }</script>
    </head>
    <body class="bg-zinc-950 text-zinc-100 min-h-screen font-sans">
        <nav class="border-b border-zinc-800 px-6 py-4 flex justify-between items-center bg-zinc-900/50 backdrop-blur">
            <div class="flex items-center space-x-3">
                <div class="bg-white text-black font-bold px-3 py-1 rounded text-sm">Deployer</div>
                <span class="font-semibold text-lg">Web Sitesi Dağıtım Merkezi</span>
            </div>
            <div class="flex items-center space-x-4">
                <div id="plan-badge" class="text-xs px-3 py-1 rounded-full border font-medium">Yükleniyor...</div>
                <button id="upgrade-btn" onclick="startPayment()" class="hidden bg-gradient-to-r from-amber-500 to-orange-500 text-black font-semibold px-3 py-1.5 rounded-lg text-xs hover:opacity-90 transition">
                    ✨ Pro'ya Yükselt (Ödeme Yap)
                </button>
            </div>
        </nav>

        <main class="max-w-6xl mx-auto px-6 py-10">
            <div class="flex justify-between items-center mb-8">
                <div>
                    <h1 class="text-2xl font-bold tracking-tight">Canlı Web Sitelerim</h1>
                    <p id="project-limit-info" class="text-sm text-zinc-400 mt-1">GitHub'daki web sitelerinizi otomatik derleyin ve yayınlayın.</p>
                </div>
                <button onclick="openModal()" class="bg-white text-black hover:bg-zinc-200 font-medium px-4 py-2 rounded-lg text-sm transition">
                    + Yeni Web Sitesi Dağıt
                </button>
            </div>

            <div id="project-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
        </main>

        <!-- İyzico Ödeme Formu Alanı -->
        <div id="iyzico-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4 z-50">
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 w-full max-w-xl shadow-2xl relative">
                <button onclick="closeIyzicoModal()" class="absolute top-3 right-4 text-zinc-400 hover:text-white text-lg">✕</button>
                <h2 class="text-lg font-bold mb-3 text-zinc-200">Pro Plan Güvenli Ödeme</h2>
                <div id="iyzico-checkout-form" class="overflow-y-auto max-h-[80vh]"></div>
            </div>
        </div>

        <div id="deploy-modal" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4">
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
                <h2 class="text-lg font-bold mb-4">Web Sitesi Ekle (Git URL)</h2>
                <form id="deploy-form" onsubmit="handleDeploy(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-medium text-zinc-400 mb-1">GitHub Repo URL (.git)</label>
                        <input type="text" id="repoUrl" required placeholder="https://github.com/kullanici/websitem.git" class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 text-zinc-200">
                    </div>
                    <div class="flex justify-end space-x-2 pt-2">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 text-sm text-zinc-400 hover:text-white">İptal</button>
                        <button type="submit" class="bg-white text-black font-medium px-4 py-2 rounded-lg text-sm hover:bg-zinc-200 transition">Dağıt ve Yayınla</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            function openModal() { document.getElementById('deploy-modal').classList.remove('hidden'); }
            function closeModal() { document.getElementById('deploy-modal').classList.add('hidden'); }
            function closeIyzicoModal() { document.getElementById('iyzico-modal').classList.add('hidden'); }

            async function fetchData() {
                const res = await fetch('/api/data');
                const data = await res.json();
                
                const badge = document.getElementById('plan-badge');
                const upgradeBtn = document.getElementById('upgrade-btn');
                const limitInfo = document.getElementById('project-limit-info');
                const projectKeys = Object.keys(data.projects);

                if (data.plan === 'free') {
                    badge.className = "text-xs px-3 py-1 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium";
                    badge.innerText = "Plan: Ücretsiz (Max 2 Site)";
                    upgradeBtn.classList.remove('hidden');
                    limitInfo.innerText = \`Ücretsiz Plan: \${projectKeys.length}/2 web sitesi dağıtıldı.\`;
                } else {
                    badge.className = "text-xs px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 font-medium";
                    badge.innerText = "⭐ Plan: Pro (Sınırsız)";
                    upgradeBtn.classList.add('hidden');
                    limitInfo.innerText = "Pro Plan: Sınırsız web sitesi dağıtımı aktif.";
                }

                const listEl = document.getElementById('project-list');
                if (projectKeys.length === 0) {
                    listEl.innerHTML = \`<div class="col-span-full text-center py-12 border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-sm">Henüz yayınlanmış bir web siteniz yok.</div>\`;
                    return;
                }

                listEl.innerHTML = projectKeys.map(name => {
                    const p = data.projects[name];
                    let statusColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                    if (p.status === 'Aktif') statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                    if (p.status.includes('Hata')) statusColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';

                    let actionBtn = \`<span class="text-zinc-600 text-xs">Yükleniyor...</span>\`;
                    if (p.status === 'Aktif') {
                        actionBtn = \`<a href="/preview/\${name}/" target="_blank" class="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded text-xs font-medium transition">🌐 Canlıyı Gör</a>\`;
                    }

                    return \`
                        <div class="border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <h3 class="font-semibold text-base">\${name}</h3>
                                    <span class="text-xs px-2 py-0.5 rounded-full border \${statusColor}">\${p.status}</span>
                                </div>
                                <p class="text-xs text-zinc-400 truncate mb-4">\${p.url}</p>
                            </div>
                            <div class="flex justify-between items-center pt-3 border-t border-zinc-800/60">
                                <button onclick="triggerDeploy('\${name}')" class="text-xs text-zinc-400 hover:text-white underline">Yeniden Derle</button>
                                \${actionBtn}
                            </div>
                        </div>
                    \`;
                }).join('');
            }

            // İyzico Ödemesini Başlat
            async function startPayment() {
                const res = await fetch('/api/initialize-payment', { method: 'POST' });
                const data = await res.json();
                
                if (data.status === 'success' && data.checkoutFormContent) {
                    document.getElementById('iyzico-modal').classList.remove('hidden');
                    const formContainer = document.getElementById('iyzico-checkout-form');
                    formContainer.innerHTML = data.checkoutFormContent;
                    
                    // İyzico script'ini sayfaya dinamik olarak dahil et
                    const scriptTag = formContainer.querySelector('script');
                    if (scriptTag) {
                        eval(scriptTag.innerHTML);
                    }
                } else {
                    alert('Ödeme formu başlatılamadı: ' + (data.errorMessage || 'Bilinmeyen hata'));
                }
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

// API Endpoints
app.get('/api/data', (req, res) => res.json({ plan: userPlan, projects }));

// 1. İyzico Ödeme Formunu Başlatma Endpoint'i
app.post('/api/initialize-payment', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const callbackUrl = `${protocol}://${host}/api/payment-callback`;

    const request = {
        locale: 'tr',
        conversationId: '123456789',
        price: '99.00', // Pro plan ücreti (Örn: 99 TL)
        paidPrice: '99.00',
        currency: 'TRY',
        basketId: 'B67832',
        paymentGroup: 'PRODUCT',
        callbackUrl: callbackUrl,
        buyer: {
            id: 'BY789',
            name: 'Ali',
            surname: 'Üzüm',
            gsmNumber: '+905350000000',
            email: 'ali@example.com',
            identityNumber: '74300864791',
            registrationAddress: 'Türkiye',
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            city: 'Istanbul',
            country: 'Turkey'
        },
        shippingAddress: {
            contactName: 'Ali Üzüm',
            city: 'Istanbul',
            country: 'Turkey',
            address: 'Türkiye'
        },
        billingAddress: {
            contactName: 'Ali Üzüm',
            city: 'Istanbul',
            country: 'Turkey',
            address: 'Türkiye'
        },
        basketItems: [
            {
                id: 'PRO-PLAN',
                name: 'Pro Plan Aboneliği',
                category1: 'Yazılım',
                itemType: 'VIRTUAL',
                price: '99.00'
            }
        ]
    };

    iyzipay.checkoutFormInitialize.create(request, function (err, result) {
        if (err) {
            return res.status(500).json({ status: 'failure', errorMessage: err.message });
        }
        res.json(result);
    });
});

// 2. İyzico Ödeme Sonucu Callback (Geri Dönüş) Endpoint'i
app.post('/api/payment-callback', (req, res) => {
    const token = req.body.token;

    iyzipay.checkoutForm.retrieve({ token: token }, function (err, result) {
        if (err || result.status !== 'success') {
            return res.send(`
                <body style="background:#09090b;color:#f43f5e;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
                    <div style="text-align:center;">
                        <h2>Ödeme Başarısız veya İptal Edildi!</h2>
                        <a href="/" style="color:#38bdf8;">Ana Sayfaya Dön</a>
                    </div>
                </body>
            `);
        }

        // Ödeme başarılı! Kullanıcıyı Pro plana yükselt
        userPlan = 'pro';

        res.send(`
            <body style="background:#09090b;color:#10b981;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
                <div style="text-align:center;">
                    <h2>Tebrikler! Ödeme Başarılı 🎉</h2>
                    <p style="color:#a1a1aa;">Hesabınız Pro plana yükseltilmiştir.</p>
                    <a href="/" style="color:#38bdf8;display:inline-block;margin-top:20px;">Yönetim Paneline Git</a>
                </div>
            </body>
        `);
    });
});

app.post('/api/deploy', (req, res) => {
    const { repoUrl } = req.body;
    if (!repoUrl) return res.status(400).json({ error: 'Repo URL zorunludur.' });

    const repoName = repoUrl.split('/').pop().replace('.git', '') || 'site';
    const currentCount = Object.keys(projects).length;

    if (userPlan === 'free' && currentCount >= 2 && !projects[repoName]) {
        return res.status(403).json({ error: 'Ücretsiz planda en fazla 2 web sitesi dağıtabilirsiniz.' });
    }

    projects[repoName] = { url: repoUrl, status: 'Klonlanıyor...', lastDeploy: new Date().toLocaleTimeString() };
    res.json({ success: true });
    executeBuildPipeline(repoName, repoUrl);
});

app.post('/api/deploy-name', (req, res) => {
    const { name } = req.body;
    if (!projects[name]) return res.status(404).send('Proje bulunamadı');
    projects[name].status = 'Güncelleniyor...';
    res.json({ success: true });
    executeBuildPipeline(name, projects[name].url);
});

function executeBuildPipeline(repoName, repoUrl) {
    const projectPath = path.join(PROJECTS_DIR, repoName);
    const gitCmd = fs.existsSync(projectPath) ? `cd "${projectPath}" && git pull` : `git clone "${repoUrl}" "${projectPath}"`;

    exec(gitCmd, (gitErr) => {
        if (gitErr) { projects[repoName].status = 'Hata (Git)'; return; }

        projects[repoName].status = 'Derleniyor...';
        const buildCmd = `cd "${projectPath}" && npm install && (npm run build --if-present)`;

        exec(buildCmd, (buildErr) => {
            if (buildErr) { projects[repoName].status = 'Hata (Build)'; return; }
            projects[repoName].status = 'Aktif';
        });
    });
}

app.listen(PORT, () => {
    console.log(`Web Sitesi Dağıtıcı sunucu ${PORT} portunda aktif!`);
});

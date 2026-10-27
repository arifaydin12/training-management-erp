require('dotenv').config();

const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const app = express();

// --- SETTINGS ---
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

// Veritabanı Konfigürasyonu
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'OgrenciEgitimDB',
    options: { 
        encrypt: false, 
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

// SQL Bağlantı Havuzu
let pool;
const connectDB = async () => {
    try {
        pool = await sql.connect(dbConfig);
        console.log("✅ [DB] SQL Veritabanı Bağlantısı Başarılı");
    } catch (err) {
        console.error("❌ [DB] Bağlantı Hatası:", err);
    }
};
connectDB();

// --- ORTAK SORGU YÜRÜTÜCÜ ---
const executeQuery = async (query, params = {}) => {
    try {
        if (!pool) await connectDB();
        const request = pool.request();
        for (const key in params) {
            request.input(key, params[key]);
        }
        const result = await request.query(query);
        return result;
    } catch (err) {
        console.error("SQL Hatası:", err.message);
        throw err;
    }
};

// --- ENDPOINTLER ---

// 1. GİRİŞ (AUTH)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await executeQuery(
            `SELECT * FROM Kullanicilar WHERE KullaniciAdi = @user`,
            { user: username }
        );

        const user = result.recordset[0];
        if (user && await bcrypt.compare(password || '', user.SifreHash)) {
            await executeQuery(`UPDATE Kullanicilar SET SonGiris = GETDATE() WHERE ID = @id`, { id: user.ID });
            res.json({ success: true, user: { id: user.ID, name: user.AdSoyad, role: user.Rol } });
        } else {
            // Hatalı giriş durumunda 401 Unauthorized dönülüyor.
            res.status(401).json({ success: false, message: "Kullanıcı adı veya şifre hatalı." });
        }
    } catch (e) { res.status(500).json({ success: false, message: "Sunucu hatası." }); }
});

// 2. DASHBOARD ÖZETİ
app.get('/api/dashboard', async (req, res) => {
    try {
        const stats = await executeQuery(`
            SELECT 
                (SELECT COUNT(*) FROM Personel WHERE Durum='Aktif') as ActivePersonel,
                (SELECT COUNT(*) FROM Egitimler WHERE Durum='Planlandı') as UpcomingTraining,
                (SELECT ISNULL(SUM(Butce), 0) FROM Egitimler WHERE YEAR(Tarih) = YEAR(GETDATE())) as TotalBudget,
                (SELECT COUNT(*) FROM EgitimKatilim) as TotalParticipations
        `);
        
        const deptDist = await executeQuery(`SELECT Departman, COUNT(*) as Count FROM Personel GROUP BY Departman`);
        
        // Son 5 Aktivite
        const recent = await executeQuery(`
            SELECT TOP 5 EgitimAdi, Tarih, Durum FROM Egitimler ORDER BY Tarih DESC
        `);

        res.json({
            stats: stats.recordset[0],
            departments: deptDist.recordset,
            recent: recent.recordset
        });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 3. PERSONEL İŞLEMLERİ
app.get('/api/personel', async (req, res) => {
    try {
        const result = await executeQuery(`SELECT * FROM Personel ORDER BY AdSoyad ASC`);
        res.json(result.recordset);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/personel', async (req, res) => {
    const { tc, name, dept, role, email } = req.body;
    try {
        await executeQuery(
            `INSERT INTO Personel (TC, AdSoyad, Departman, Gorev, Email) VALUES (@tc, @name, @dept, @role, @email)`,
            { tc, name, dept, role, email }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.put('/api/personel/:id', async (req, res) => {
    const { id } = req.params;
    const { name, dept, role, email, status } = req.body;
    try {
        await executeQuery(
            `UPDATE Personel SET AdSoyad=@name, Departman=@dept, Gorev=@role, Email=@email, Durum=@status WHERE ID=@id`,
            { id, name, dept, role, email, status }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/personel/:id', async (req, res) => {
    try {
        await executeQuery(`DELETE FROM Personel WHERE ID = @id`, { id: req.params.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 4. EĞİTİM İŞLEMLERİ
app.get('/api/egitim', async (req, res) => {
    try {
        // Liste çekerken, o eğitime kaç kişi atanmış (ParticipantCount) bilgisini de çekiyoruz.
        const result = await executeQuery(`
            SELECT E.*, 
            (SELECT COUNT(*) FROM EgitimKatilim EK WHERE EK.EgitimID = E.ID) as KatilimciSayisi
            FROM Egitimler E 
            ORDER BY E.Tarih DESC
        `);
        res.json(result.recordset);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/egitim', async (req, res) => {
    const { name, category, date, budget, trainer } = req.body;
    try {
        await executeQuery(
            `INSERT INTO Egitimler (EgitimAdi, Kategori, Tarih, Butce, Egitmen) VALUES (@name, @cat, @date, @budget, @trainer)`,
            { name, cat: category, date, budget, trainer }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.put('/api/egitim/durum/:id', async (req, res) => {
    try {
        await executeQuery(`UPDATE Egitimler SET Durum = @status WHERE ID = @id`, { id: req.params.id, status: req.body.status });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 5. ATAMA İŞLEMLERİ (Önemli Yeni Kısım)
// Belirli bir eğitime atanmış personelleri getir
app.get('/api/egitim/:id/katilimcilar', async (req, res) => {
    try {
        const result = await executeQuery(`
            SELECT P.ID, P.AdSoyad, P.Departman, EK.KatilimDurumu
            FROM EgitimKatilim EK
            INNER JOIN Personel P ON EK.PersonelID = P.ID
            WHERE EK.EgitimID = @id
        `, { id: req.params.id });
        res.json(result.recordset);
    } catch (e) { res.status(500).send(e.message); }
});

// Personeli eğitime ata
app.post('/api/atama', async (req, res) => {
    const { egitimId, personelId } = req.body;
    try {
        // Mükerrer kayıt kontrolü
        const check = await executeQuery(`SELECT * FROM EgitimKatilim WHERE EgitimID=@eid AND PersonelID=@pid`, { eid: egitimId, pid: personelId });
        if(check.recordset.length > 0) {
            return res.status(400).json({ success: false, message: "Personel zaten bu eğitime kayıtlı." });
        }

        await executeQuery(
            `INSERT INTO EgitimKatilim (EgitimID, PersonelID) VALUES (@eid, @pid)`,
            { eid: egitimId, pid: personelId }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.delete('/api/atama', async (req, res) => {
    const { egitimId, personelId } = req.body;
    try {
        await executeQuery(`DELETE FROM EgitimKatilim WHERE EgitimID=@eid AND PersonelID=@pid`, { eid: egitimId, pid: personelId });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Sunucuyu Başlat
app.listen(PORT, () => {
    console.log(`🚀 KURUMSAL SUNUCU AKTİF: http://localhost:${PORT}`);
});
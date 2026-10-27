// Creates an application user with a bcrypt-hashed password.
// Usage: npm run create-admin -- admin "Full Name" "a-strong-password"
require('dotenv').config();

const sql = require('mssql');
const bcrypt = require('bcryptjs');

(async () => {
    const [username, fullName, password] = process.argv.slice(2);
    if (!username || !fullName || !password) {
        console.error('Usage: npm run create-admin -- <username> "<Full Name>" "<password>"');
        process.exit(1);
    }

    const pool = await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER || 'localhost',
        database: process.env.DB_NAME || 'OgrenciEgitimDB',
        options: { encrypt: false, trustServerCertificate: true }
    });

    const hash = await bcrypt.hash(password, 10);
    await pool.request()
        .input('u', username)
        .input('h', hash)
        .input('n', fullName)
        .query("INSERT INTO Kullanicilar (KullaniciAdi, SifreHash, AdSoyad, Rol) VALUES (@u, @h, @n, N'Admin')");

    console.log(`User created: ${username}`);
    await pool.close();
})().catch(err => {
    console.error(err.message);
    process.exit(1);
});

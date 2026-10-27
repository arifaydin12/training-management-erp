# Training Management ERP

A corporate portal for planning employee training: manage personnel, schedule training sessions, assign people to them and follow budgets from one dashboard. It is a **Node.js / Express** API on **SQL Server** with a single-page front end.

![Training Management ERP login](docs/screenshot.png)

## Features

- **Dashboard** with active personnel, upcoming trainings, this year's training budget and total participations
- **Department distribution** and a feed of the latest training activity
- **Personnel management**: add, edit, deactivate and delete employees
- **Training calendar**: create sessions with category, date, budget and trainer, and update their status
- **Assignments**: assign or remove personnel for a session, with duplicate-registration protection and a participant list per session
- **Secure sign-in**: passwords are stored as bcrypt hashes
- Parameterised SQL queries throughout

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS and vanilla JavaScript (single page) |
| Backend | Node.js, Express 5, `mssql`, `bcryptjs`, `dotenv` |
| Database | Microsoft SQL Server |

## REST API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/login` | Sign in |
| GET | `/api/dashboard` | Summary statistics |
| GET / POST | `/api/personel` | List and create personnel |
| PUT / DELETE | `/api/personel/:id` | Update and delete personnel |
| GET / POST | `/api/egitim` | List and create trainings |
| PUT | `/api/egitim/durum/:id` | Update training status |
| GET | `/api/egitim/:id/katilimcilar` | Participants of a training |
| POST / DELETE | `/api/atama` | Assign or unassign personnel |

## Getting started

**Prerequisites:** Node.js 18+ and SQL Server.

1. **Create the database** by running [`database/schema.sql`](database/schema.sql).

2. **Configure and install**

   ```bash
   npm install
   cp .env.example .env     # on Windows: copy .env.example .env
   ```

   Fill in your SQL Server login in `.env`.

3. **Create the first user**

   ```bash
   npm run create-admin -- admin "Your Name" "a-strong-password"
   ```

4. **Run**

   ```bash
   npm start
   ```

   Open `index.html` in a browser (the API listens on `http://localhost:3000`).

## Project structure

```
server.js              Express API
index.html             Single-page front end
database/schema.sql    SQL Server tables
scripts/create-admin.js  Creates a user with a hashed password
```

## Roadmap

- Protect the data endpoints with JWT, as in the sister project [mold-tracking-system](https://github.com/vaas125/mold-tracking-system)
- Serve the front end from Express so one command starts everything
- Role-based permissions per module

The interface is in Turkish.

## License

[MIT](LICENSE) © Arif Enes

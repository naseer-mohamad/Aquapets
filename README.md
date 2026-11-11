# 🐠 Aqua Pets – Full-Stack E-Commerce Web Application

AquaPets is a full-stack e-commerce web application developed for aquarium and pet products. It provides customers with a platform to browse products, manage shopping carts, place orders, and track their purchases, along with an admin dashboard for managing products and customer orders.

🌐 **Live Website:** https://aquapets-delta.vercel.app

💻 **GitHub Repository:** https://github.com/naseer-mohamad/Aquapets

---

## 📌 Project Overview

Aqua Pets was developed to provide a simple online shopping experience for aquarium and pet enthusiasts.

The application includes customer authentication, product browsing, shopping cart management, checkout, order processing, and administrative management.

The project follows a frontend-backend architecture, with a React-based frontend communicating with a Node.js and Express.js backend through REST APIs.

## ✨ Features

### 👤 Customer Features
- Customer registration and login.
- Secure authentication using JWT and HTTP-only cookies.
- Browse available products and view product details.
- Add, update, and remove products from the shopping cart.
- Manage customer profile and delivery information.
- Checkout and place orders.
- View order history and order status.
- Cancel eligible orders.

### 🛠️ Admin Features
- Admin authentication.
- Admin dashboard.
- Add, update, and delete products.
- Manage customer orders.
- View customer order information and order status.

## 🧰 Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React 19, Vite |
| Backend | Node.js, Express.js |
| Database | Turso (libSQL) |
| Authentication | JWT, HTTP-only Cookies |
| Image Storage | Cloudinary |
| API | REST APIs |
| Version Control | Git, GitHub |
| Frontend Deployment | Vercel |
| Backend Deployment | Render |

## 🏗️ Application Architecture

The application follows a client-server architecture.

```text
             CUSTOMER / ADMIN
                    |
                    v
             React Frontend
               (Vite)
                    |
                    v
           Express.js REST API
                    |
          +---------+---------+
          |         |         |
          v         v         v
        Turso    Cloudinary  JWT
       Database   Images    Auth
```

## 🚀 Local Installation and Setup

### Prerequisites

Make sure you have the following installed:

- Node.js
- npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/naseer-mohamad/Aquapets.git
cd Aquapets
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

Configure the backend environment variables using the required values for your Turso database, Cloudinary account, authentication, admin account, and application configuration.

### 3. Start the backend

```bash
npm start
```

### 4. Install frontend dependencies

Open another terminal:

```bash
cd frontend
npm install
```

Configure the frontend API URL to point to your local backend.

### 5. Start the frontend

```bash
npm run dev
```

Open the local development URL displayed by Vite in your browser.

## 🔐 Environment Configuration

The application requires environment configuration for:

- Database connection.
- Database authentication token.
- JWT authentication secret.
- Admin account credentials.
- Cloudinary configuration.
- CORS allowed frontend origin.
- Frontend API URL.

**Important:** Never commit actual environment files, passwords, API keys, database tokens, or authentication secrets to GitHub.

Refer to the backend and frontend configuration when creating your local environment files.

## 🌍 Deployment

The application is deployed using:

- **Frontend:** Vercel
- **Backend:** Render
- **Database:** Turso
- **Image Hosting:** Cloudinary

Visit the live application:

https://aquapets-delta.vercel.app

## 👨‍💻 Developer

**Naseer Mohamad K**

B.Tech – Artificial Intelligence and Data Science

- GitHub: https://github.com/naseer-mohamad
- LinkedIn: https://linkedin.com/in/naseer-mohamad

---

*Developed as a full-stack web development project to gain practical experience in frontend development, backend APIs, database integration, authentication, and cloud deployment.*

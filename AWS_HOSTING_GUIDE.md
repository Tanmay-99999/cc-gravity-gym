# Detailed AWS Hosting Guide: Gym Management System

This guide provides an in-depth walkthrough of the major steps required to host your Gym Management System on AWS.

---

## 1. EC2 Instance Setup
Setting up your virtual server (EC2) is the first step in cloud hosting.

*   **AMI (Amazon Machine Image):** 
    *   Choose **Ubuntu Server 22.04 LTS**. It is the industry standard for Node.js deployments and is "Free Tier Eligible."
*   **Instance Type:** 
    *   Select **t2.micro** (or `t3.micro` depending on your region). This provides 1GB of RAM, which is sufficient for this project under the AWS Free Tier.
*   **Key Pair:** 
    *   Create a new `.pem` key pair. You **must** download and save this file; you cannot download it again later. Use it to SSH into your server.
*   **Security Groups (Firewall):** 
    *   Configure the following **Inbound Rules**:
        *   **SSH (Port 22):** Set to "My IP" for secure administrative access.
        *   **HTTP (Port 80):** Set to "Anywhere (0.0.0.0/0)" to allow users to access the website.
        *   **HTTPS (Port 443):** (Optional) For secure SSL traffic.
        *   **Custom TCP (Port 5000):** Only needed if you are NOT using a Reverse Proxy (Nginx) to reach the backend API.

---

## 2. Database Setup: Amazon Aurora (RDS)
This project uses **Amazon Aurora**, a high-performance, MySQL-compatible relational database managed by AWS RDS.

*   **Service:** Amazon Aurora (MySQL-Compatible Edition).
*   **Platform:** AWS Relational Database Service (RDS).
*   **Management (MySQL Workbench):**
    *   Since Aurora is fully compatible with MySQL, you can use **MySQL Workbench** on your local machine to connect to the database.
    *   **Connectivity:** You connect using the **Cluster Endpoint** provided in the RDS Console.
    *   **Inbound Rules:** Your Aurora Security Group must allow traffic on **Port 3306** from your IP address to allow MySQL Workbench access.

### Why Aurora?
*   **Fully Managed:** AWS handles backups, patching, and hardware scaling automatically.
*   **Performance:** Up to 5x the throughput of standard MySQL.
*   **Reliability:** Data is replicated 6 times across 3 Availability Zones, providing extreme durability.

> [!NOTE]
> When deploying the backend, ensure your EC2 instance has permission to access the Aurora Cluster. This is usually done by adding the EC2 Security Group ID to the Aurora Security Group's inbound rules.

---

## 3. Server Environment Configuration
Once connected via SSH (`ssh -i "key.pem" ubuntu@ip`), run these commands:

1.  **Update System:**
    ```bash
    sudo apt update && sudo apt upgrade -y
    ```
2.  **Install Node.js:**
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    ```
3.  **Install Git:**
    ```bash
    sudo apt install git -y
    ```

---

## 4. Application Deployment
1.  **Cloning:** 
    *   Clone your code: `git clone <repo_url>`.
    *   Navigate to the backend: `cd <repo>/backend`.
2.  **Environment Variables (.env):** 
    *   Create a `.env` file using the example provided.
    *   Fill in your DB credentials (use your **Aurora Cluster Endpoint** for `DB_HOST`).
    *   Set `PORT=5000`.
3.  **Process Management (PM2):**
    *   Install PM2: `sudo npm install -g pm2`.
    *   Start the server: `pm2 start server.js --name "gym-system"`.
    *   This keeps your backend and frontend running even if you close the terminal.

---

## 5. Serving Frontend
In this project, the **backend server (server.js)** is configured to serve the frontend files directly from the parent directory.

*   **Access:** You can access the entire application (frontend and API) via:
    `http://YOUR_EC2_PUBLIC_IP:5000`
*   **Security:** Ensure your **EC2 Security Group** allows inbound traffic on **Port 5000**.
*   **Logic:** The backend automatically maps static files like `index.html`, `css/`, and `js/` to the root URL.

---

## 6. Final Connection
Update your `js/storage.js` file to point to your EC2 instance's port 5000:
```javascript
static API_BASE = "http://YOUR_EC2_PUBLIC_IP:5000/api";
```

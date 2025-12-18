const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const serverDir = path.join(rootDir, 'server');

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function checkFile(filePath, description, isCritical = true) {
    if (fs.existsSync(filePath)) {
        console.log(`${colors.green}✓ ${description} found.${colors.reset}`);
        return true;
    } else {
        if (isCritical) {
            console.error(`${colors.red}✗ Missing ${description}: ${filePath}${colors.reset}`);
        } else {
            console.warn(`${colors.yellow}! Missing ${description}: ${filePath}${colors.reset}`);
        }
        return false;
    }
}

console.log(`${colors.bold}Checking environment setup...${colors.reset}\n`);

let hasErrors = false;

// 1. Check Root .env
if (!checkFile(path.join(rootDir, '.env'), 'Frontend .env file')) {
    console.log(`  ${colors.yellow}Tip: Copy .env.example to .env and add your public keys.${colors.reset}\n`);
    hasErrors = true;
}

// 2. Check Server .env
if (!checkFile(path.join(serverDir, '.env'), 'Backend .env file')) {
    console.log(`  ${colors.yellow}Tip: Create server/.env with your secrets (GEMINI_KEY, JWT_SECRET).${colors.reset}\n`);
    hasErrors = true;
}

// 3. Check Database
if (!checkFile(path.join(serverDir, 'prisma', 'dev.db'), 'SQLite Database', false)) {
    console.log(`  ${colors.yellow}Notice: Database not found.${colors.reset}`);
    console.log(`  ${colors.bold}Action Required:${colors.reset} Run ${colors.green}cd server && npx prisma db push${colors.reset} to initialize it.\n`);
    // We don't set hasErrors = true here because the app might crash nicely or we just want to warn them.
    // Actually, without DB the server will likely crash, so it's good to be loud about it.
}

if (hasErrors) {
    console.log(`${colors.red}Environment check failed. Please fix the issues above.${colors.reset}`);
    // Optional: process.exit(1) if you want to block startup
} else {
    console.log(`\n${colors.green}Environment check passed! Starting application...${colors.reset}\n`);
}

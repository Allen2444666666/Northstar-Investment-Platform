// server.js
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.resolve(process.env.DATA_FILE || "./data.json");
const ADMIN_EMAIL = String(
  process.env.ADMIN_EMAIL || "admin@northstar.local"
).toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe-Admin-123!";
const isProd = process.env.NODE_ENV === "production";

app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    name: "northstar.sid",
    secret:
      process.env.SESSION_SECRET ||
      "replace-this-development-secret-before-deployment",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use(express.static(path.join(__dirname, "public")));

const makeId = () => crypto.randomUUID();
const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const PRODUCTS = [
  { id: "stk-aapl", name: "Apple Inc.", category: "Stocks", description: "Large-cap technology company.", risk: "Medium", minInvestment: 25 },
  { id: "stk-msft", name: "Microsoft", category: "Stocks", description: "Enterprise software and cloud services.", risk: "Medium", minInvestment: 25 },
  { id: "stk-nvda", name: "NVIDIA", category: "Stocks", description: "Semiconductors and accelerated computing.", risk: "High", minInvestment: 25 },
  { id: "stk-amzn", name: "Amazon", category: "Stocks", description: "E-commerce and cloud computing.", risk: "Medium", minInvestment: 25 },
  { id: "stk-goog", name: "Alphabet", category: "Stocks", description: "Digital services and technology.", risk: "Medium", minInvestment: 25 },
  { id: "etf-sp500", name: "S&P 500 Index ETF", category: "ETFs", description: "Broad exposure to large US companies.", risk: "Medium", minInvestment: 50 },
  { id: "etf-world", name: "Global Equity ETF", category: "ETFs", description: "Diversified global equity exposure.", risk: "Medium", minInvestment: 50 },
  { id: "etf-bond", name: "Bond Market ETF", category: "ETFs", description: "A demo fixed-income basket.", risk: "Low", minInvestment: 50 },
  { id: "crypto-btc", name: "Bitcoin", category: "Crypto", description: "Highly volatile digital asset simulation.", risk: "Very high", minInvestment: 10 },
  { id: "crypto-eth", name: "Ethereum", category: "Crypto", description: "Blockchain ecosystem asset simulation.", risk: "Very high", minInvestment: 10 },
  { id: "crypto-sol", name: "Solana", category: "Crypto", description: "Digital asset with substantial volatility.", risk: "Very high", minInvestment: 10 },
  { id: "cmd-gold", name: "Gold", category: "Commodities", description: "Precious-metal exposure simulation.", risk: "Medium", minInvestment: 25 },
  { id: "cmd-silver", name: "Silver", category: "Commodities", description: "Industrial and precious-metal exposure.", risk: "High", minInvestment: 25 },
  { id: "cmd-oil", name: "Crude Oil", category: "Commodities", description: "Energy commodity exposure simulation.", risk: "High", minInvestment: 25 },
  { id: "re-residential", name: "Residential Property Fund", category: "Real Estate", description: "Illustrative diversified property fund.", risk: "Medium", minInvestment: 100 },
  { id: "re-commercial", name: "Commercial Property Fund", category: "Real Estate", description: "Illustrative commercial property basket.", risk: "Medium", minInvestment: 100 },
  { id: "fi-treasury", name: "Treasury Bills", category: "Fixed Income", description: "Short-term government debt simulation.", risk: "Low", minInvestment: 100 },
  { id: "fi-corporate", name: "Corporate Bonds", category: "Fixed Income", description: "Illustrative corporate debt basket.", risk: "Medium", minInvestment: 100 },
  { id: "fi-money", name: "Money Market Fund", category: "Fixed Income", description: "Lower-volatility cash-equivalent simulation.", risk: "Low", minInvestment: 100 },
];

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {
      users: [],
      positions: [],
      activity: [],
      deposits: [],
      withdrawals: [],
    };
  }
}

let db = readDB();

function writeDB() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tempFile = DATA_FILE + ".tmp";
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), {
    mode: 0o600,
  });
  fs.renameSync(tempFile, DATA_FILE);
}

function findUserByEmail(email) {
  return db.users.find(
    (user) => user.email === String(email || "").trim().toLowerCase()
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    balance: user.balance,
    status: user.status,
    createdAt: user.createdAt,
  };
}

function addActivity(userId, type, description, amount, status = "COMPLETED", extra = {}) {
  db.activity.unshift({
    id: makeId(),
    userId,
    type,
    description,
    amount: round(amount),
    status,
    createdAt: new Date().toISOString(),
    ...extra,
  });
}

function validAmount(amount) {
  return Number.isFinite(Number(amount)) &&
    Number(amount) > 0 &&
    Number(amount) <= 100000000;
}

function requireAuth(req, res, next) {
  const user = db.users.find((u) => u.id === req.session.userId);

  if (!user) {
    return res.status(401).json({ error: "Please log in first." });
  }

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  next();
}

function fail(res, message, status = 400) {
  return res.status(status).json({ error: message });
}

async function createAdminIfMissing() {
  if (findUserByEmail(ADMIN_EMAIL)) return;

  db.users.push({
    id: makeId(),
    name: "Northstar Admin",
    email: ADMIN_EMAIL,
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
    role: "admin",
    balance: 0,
    status: "Active",
    createdAt: new Date().toISOString(),
  });

  writeDB();
}

createAdminIfMissing().catch(console.error);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mode: "demo",
    paymentsConfigured: false,
    storage: "local-json-demo",
  });
});

// Register
app.post("/api/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (name.length < 2) return fail(res, "Enter your full name.");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(res, "Enter a valid email address.");
  }

  if (password.length < 8) {
    return fail(res, "Password must be at least 8 characters.");
  }

  if (findUserByEmail(email)) {
    return fail(res, "An account with that email already exists.");
  }

  const user = {
    id: makeId(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "user",
    balance: 0,
    status: "Active",
    createdAt: new Date().toISOString(),
  };

  db.users.push(user);
  addActivity(user.id, "ACCOUNT", "Account created", 0);
  writeDB();

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

// Login
app.post("/api/login", async (req, res) => {
  const user = findUserByEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return fail(res, "Incorrect email or password.", 401);
  }

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("northstar.sid");
    res.json({ ok: true });
  });
});

// Current user
app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Products
app.get("/api/products", requireAuth, (req, res) => {
  res.json({ products: PRODUCTS });
});

// Portfolio
app.get("/api/portfolio", requireAuth, (req, res) => {
  const portfolio = db.positions
    .filter((p) => p.userId === req.user.id)
    .map((p) => ({ ...p, currentValue: round(p.currentValue) }));

  res.json({ portfolio });
});

// Activity
app.get("/api/activity", requireAuth, (req, res) => {
  res.json({
    activity: db.activity
      .filter((a) => a.userId === req.user.id)
      .slice(0, 250),
  });
});

// Activity CSV export
app.get("/api/activity.csv", requireAuth, (req, res) => {
  const rows = [
    ["Date", "Type", "Description", "Amount", "Status"],
    ...db.activity
      .filter((a) => a.userId === req.user.id)
      .map((a) => [a.createdAt, a.type, a.description, a.amount, a.status]),
  ];

  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="northstar-activity.csv"'
  );
  res.send(csv);
});

// Buy a demo investment
app.post("/api/trade", requireAuth, (req, res) => {
  const product = PRODUCTS.find((p) => p.id === req.body.productId);
  const amount = Number(req.body.amount);

  if (!product) return fail(res, "Unknown investment product.");

  if (!validAmount(amount) || amount < product.minInvestment) {
    return fail(res, `Amount must be at least $${product.minInvestment}.`);
  }

  if (req.user.balance < amount) {
    return fail(
      res,
      "Insufficient available balance. Submit a deposit request and wait for admin verification."
    );
  }

  req.user.balance = round(req.user.balance - amount);

  const position = {
    id: makeId(),
    userId: req.user.id,
    productId: product.id,
    productName: product.name,
    category: product.category,
    principal: round(amount),
    currentValue: round(amount),
    status: "OPEN",
    createdAt: new Date().toISOString(),
  };

  db.positions.push(position);

  addActivity(
    req.user.id,
    "INVESTMENT",
    `Invested in ${product.name}`,
    -amount,
    "COMPLETED",
    { positionId: position.id }
  );

  writeDB();
  res.json({ position, balance: req.user.balance });
});

// Customer deposit requests
app.get("/api/deposits", requireAuth, (req, res) => {
  res.json({
    deposits: db.deposits.filter((d) => d.userId === req.user.id),
  });
});

app.post("/api/deposits", requireAuth, (req, res) => {
  const amount = Number(req.body.amount);

  if (!validAmount(amount)) {
    return fail(res, "Enter a valid deposit amount.");
  }

  const deposit = {
    id: makeId(),
    userId: req.user.id,
    userEmail: req.user.email,
    amount: round(amount),
    reference: String(req.body.reference || "").slice(0, 160),
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };

  db.deposits.unshift(deposit);

  addActivity(
    req.user.id,
    "DEPOSIT_REQUEST",
    "Deposit submitted for verification",
    amount,
    "PENDING",
    { requestId: deposit.id }
  );

  writeDB();
  res.json({ deposit });
});

// Customer withdrawal requests
app.get("/api/withdrawals", requireAuth, (req, res) => {
  res.json({
    withdrawals: db.withdrawals.filter((w) => w.userId === req.user.id),
  });
});

app.post("/api/withdrawals", requireAuth, (req, res) => {
  const amount = Number(req.body.amount);
  const bankName = String(req.body.bankName || "").trim();
  const accountName = String(req.body.accountName || "").trim();
  const accountNumber = String(req.body.accountNumber || "").trim();

  if (!validAmount(amount)) {
    return fail(res, "Enter a valid withdrawal amount.");
  }

  if (!bankName || !accountName || !accountNumber) {
    return fail(res, "Complete all bank details.");
  }

  if (amount > req.user.balance) {
    return fail(res, "Withdrawal amount exceeds your available balance.");
  }

  const withdrawal = {
    id: makeId(),
    userId: req.user.id,
    userEmail: req.user.email,
    amount: round(amount),
    bankName: bankName.slice(0, 100),
    accountName: accountName.slice(0, 100),
    accountNumber: accountNumber.slice(0, 40),
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };

  db.withdrawals.unshift(withdrawal);

  addActivity(
    req.user.id,
    "WITHDRAWAL_REQUEST",
    "Withdrawal requested",
    -amount,
    "PENDING",
    { requestId: withdrawal.id }
  );

  writeDB();
  res.json({ withdrawal });
});

// Admin: list users and queues
app.get("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  res.json({ users: db.users.map(publicUser) });
});

app.get("/api/admin/deposits", requireAuth, requireAdmin, (req, res) => {
  res.json({ deposits: db.deposits });
});

app.get("/api/admin/withdrawals", requireAuth, requireAdmin, (req, res) => {
  res.json({ withdrawals: db.withdrawals });
});

// Admin: approve deposit and credit the balance once
app.post(
  "/api/admin/deposits/:id/approve",
  requireAuth,
  requireAdmin,
  (req, res) => {
    const deposit = db.deposits.find((d) => d.id === req.params.id);

    if (!deposit) return fail(res, "Deposit request not found.", 404);
    if (deposit.status !== "PENDING") {
      return fail(res, "This deposit request has already been reviewed.");
    }

    const user = db.users.find((u) => u.id === deposit.userId);
    if (!user) return fail(res, "User not found.", 404);

    user.balance = round(user.balance + deposit.amount);
    deposit.status = "APPROVED";
    deposit.reviewedAt = new Date().toISOString();

    addActivity(
      user.id,
      "DEPOSIT",
      `Deposit approved${deposit.reference ? " — " + deposit.reference : ""}`,
      deposit.amount,
      "COMPLETED",
      { requestId: deposit.id }
    );

    writeDB();
    res.json({ deposit });
  }
);

// Admin: reject deposit
app.post(
  "/api/admin/deposits/:id/reject",
  requireAuth,
  requireAdmin,
  (req, res) => {
    const deposit = db.deposits.find((d) => d.id === req.params.id);

    if (!deposit) return fail(res, "Deposit request not found.", 404);
    if (deposit.status !== "PENDING") {
      return fail(res, "This deposit request has already been reviewed.");
    }

    deposit.status = "REJECTED";
    deposit.reviewedAt = new Date().toISOString();

    addActivity(
      deposit.userId,
      "DEPOSIT_REJECTED",
      "Deposit request rejected",
      0,
      "REJECTED",
      { requestId: deposit.id }
    );

    writeDB();
    res.json({ deposit });
  }
);

// Admin: approve withdrawal and reserve the balance once
app.post(
  "/api/admin/withdrawals/:id/approve",
  requireAuth,
  requireAdmin,
  (req, res) => {
    const withdrawal = db.withdrawals.find((w) => w.id === req.params.id);

    if (!withdrawal) {
      return fail(res, "Withdrawal request not found.", 404);
    }

    if (withdrawal.status !== "PENDING") {
      return fail(res, "This withdrawal is no longer pending.");
    }

    const user = db.users.find((u) => u.id === withdrawal.userId);
    if (!user) return fail(res, "User not found.", 404);

    if (user.balance < withdrawal.amount) {
      return fail(res, "User no longer has sufficient available balance.");
    }

    user.balance = round(user.balance - withdrawal.amount);
    withdrawal.status = "APPROVED";
    withdrawal.approvedAt = new Date().toISOString();

    addActivity(
      user.id,
      "WITHDRAWAL_RESERVED",
      "Withdrawal approved; amount reserved pending manual payment",
      -withdrawal.amount,
      "COMPLETED",
      { requestId: withdrawal.id }
    );

    writeDB();
    res.json({ withdrawal });
  }
);

// Admin: reject a pending withdrawal
app.post(
  "/api/admin/withdrawals/:id/reject",
  requireAuth,
  requireAdmin,
  (req, res) => {
    const withdrawal = db.withdrawals.find((w) => w.id === req.params.id);

    if (!withdrawal) {
      return fail(res, "Withdrawal request not found.", 404);
    }

    if (withdrawal.status !== "PENDING") {
      return fail(res, "Only pending withdrawals can be rejected.");
    }

    withdrawal.status = "REJECTED";
    withdrawal.reviewedAt = new Date().toISOString();

    addActivity(
      withdrawal.userId,
      "WITHDRAWAL_REJECTED",
      "Withdrawal request rejected; no balance deducted",
      0,
      "REJECTED",
      { requestId: withdrawal.id }
    );

    writeDB();
    res.json({ withdrawal });
  }
);

// Admin: record that the manual transfer has been sent
app.post(
  "/api/admin/withdrawals/:id/mark-paid",
  requireAuth,
  requireAdmin,
  (req, res) => {
    const withdrawal = db.withdrawals.find((w) => w.id === req.params.id);

    if (!withdrawal) {
      return fail(res, "Withdrawal request not found.", 404);
    }

    if (withdrawal.status !== "APPROVED") {
      return fail(res, "Only approved withdrawals can be marked paid.");
    }

    withdrawal.status = "PAID";
    withdrawal.paidAt = new Date().toISOString();

    addActivity(
      withdrawal.userId,
      "WITHDRAWAL_PAID",
      "Admin marked withdrawal as manually paid",
      0,
      "COMPLETED",
      { requestId: withdrawal.id }
    );

    writeDB();
    res.json({ withdrawal });
  }
);

// Admin: manual credit
app.post("/api/admin/credit", requireAuth, requireAdmin, (req, res) => {
  const user = db.users.find((u) => u.id === req.body.userId);
  const amount = Number(req.body.amount);
  const reason = String(req.body.reason || "").trim();

  if (!user) return fail(res, "User not found.");
  if (!validAmount(amount)) return fail(res, "Enter a valid positive credit.");
  if (!reason) return fail(res, "A reason is required.");

  user.balance = round(user.balance + amount);

  addActivity(
    user.id,
    "ADMIN_CREDIT",
    reason,
    amount,
    "COMPLETED",
    { adminId: req.user.id }
  );

  writeDB();
  res.json({ user: publicUser(user) });
});

// Admin: simulated return on a demo portfolio position
app.post(
  "/api/admin/simulated-return",
  requireAuth,
  requireAdmin,
  (req, res) => {
    const position = db.positions.find(
      (p) => p.id === req.body.positionId
    );
    const percentage = Number(req.body.percentage);
    const reason = String(req.body.reason || "").trim();

    if (!position) return fail(res, "Position not found.");

    if (
      !Number.isFinite(percentage) ||
      percentage < -100 ||
      percentage > 1000
    ) {
      return fail(res, "Percentage must be between -100 and 1000.");
    }

    if (!reason) return fail(res, "A reason is required.");

    const oldValue = position.currentValue;
    position.currentValue = round(
      Math.max(0, oldValue * (1 + percentage / 100))
    );
    position.lastSimulatedReturnAt = new Date().toISOString();

    addActivity(
      position.userId,
      "SIMULATED_RETURN",
      `${position.productName}: ${reason} (${percentage}%)`,
      round(position.currentValue - oldValue),
      "SIMULATED",
      { positionId: position.id, percentage }
    );

    writeDB();
    res.json({ position });
  }
);

// API fallback
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

// Frontend fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Northstar Invest running at http://localhost:${PORT}`);
});
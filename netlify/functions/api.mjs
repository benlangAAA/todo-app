import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const users = getStore("todo-users");
const todoData = getStore("todo-user-data");
const secret = process.env.JWT_SECRET;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});

const base64url = (value) => Buffer.from(value).toString("base64url");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const userKey = (email) => `email/${sha256(email.trim().toLowerCase())}`;
const dataKey = (userId) => `user/${userId}`;

function signToken(userId) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 }));
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function readToken(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) throw new Error("请重新登录");
  const expected = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("登录状态无效");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!decoded.sub || decoded.exp < Math.floor(Date.now() / 1000)) throw new Error("登录已过期");
  return decoded.sub;
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    throw new Error("请求内容格式错误");
  }
}

function apiPath(event) {
  return event.path.replace(/^\/api/, "").replace(/^\/\.netlify\/functions\/api/, "") || "/";
}

async function loadTodos(userId) {
  return (await todoData.get(dataKey(userId), { type: "json", consistency: "strong" })) || { tasks: [] };
}

async function saveTodos(userId, data) {
  await todoData.setJSON(dataKey(userId), data);
}

function cleanTask(task, id = crypto.randomUUID()) {
  return {
    id,
    title: String(task.title || "").trim().slice(0, 300),
    priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
    due: /^\d{4}-\d{2}-\d{2}$/.test(task.due || "") ? task.due : "",
    completed: Boolean(task.completed),
    createdAt: Number(task.createdAt) || Date.now()
  };
}

export const handler = async (event) => {
  try {
    if (!secret) return json(500, { error: "服务端尚未配置 JWT_SECRET" });
    const path = apiPath(event);

    if (event.httpMethod === "POST" && path === "/register") {
      const { email = "", passwordHash = "" } = parseBody(event);
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return json(400, { error: "请输入有效邮箱" });
      if (!/^[a-f0-9]{64}$/.test(passwordHash)) return json(400, { error: "密码格式错误" });
      const key = userKey(normalizedEmail);
      if (await users.get(key, { type: "json", consistency: "strong" })) return json(409, { error: "这个邮箱已经注册" });
      const user = { id: crypto.randomUUID(), email: normalizedEmail, passwordHash, createdAt: new Date().toISOString() };
      await users.setJSON(key, user);
      await saveTodos(user.id, { tasks: [] });
      return json(201, { token: signToken(user.id), email: user.email });
    }

    if (event.httpMethod === "POST" && path === "/login") {
      const { email = "", passwordHash = "" } = parseBody(event);
      const normalizedEmail = email.trim().toLowerCase();
      const user = await users.get(userKey(normalizedEmail), { type: "json", consistency: "strong" });
      const supplied = Buffer.from(String(passwordHash));
      const stored = Buffer.from(user?.passwordHash || "0".repeat(64));
      if (!user || supplied.length !== stored.length || !crypto.timingSafeEqual(supplied, stored)) return json(401, { error: "邮箱或密码不正确" });
      return json(200, { token: signToken(user.id), email: user.email });
    }

    const userId = readToken(event);
    const data = await loadTodos(userId);

    if (event.httpMethod === "GET" && path === "/todos") return json(200, data);

    if (event.httpMethod === "POST" && path === "/todos") {
      const task = cleanTask(parseBody(event));
      if (!task.title) return json(400, { error: "事项标题不能为空" });
      data.tasks.unshift(task);
      await saveTodos(userId, data);
      return json(201, task);
    }

    const match = path.match(/^\/todos\/([^/]+)$/);
    if (match && event.httpMethod === "PUT") {
      const index = data.tasks.findIndex((task) => task.id === match[1]);
      if (index < 0) return json(404, { error: "事项不存在" });
      data.tasks[index] = cleanTask({ ...data.tasks[index], ...parseBody(event) }, data.tasks[index].id);
      if (!data.tasks[index].title) return json(400, { error: "事项标题不能为空" });
      await saveTodos(userId, data);
      return json(200, data.tasks[index]);
    }

    if (match && event.httpMethod === "DELETE") {
      const next = data.tasks.filter((task) => task.id !== match[1]);
      if (next.length === data.tasks.length) return json(404, { error: "事项不存在" });
      await saveTodos(userId, { tasks: next });
      return json(200, { ok: true });
    }

    return json(404, { error: "接口不存在" });
  } catch (error) {
    const unauthorized = /登录|令牌/.test(error.message);
    return json(unauthorized ? 401 : 500, { error: error.message || "服务器暂时不可用" });
  }
};

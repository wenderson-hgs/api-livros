/**
 * API REST de Livros — projeto de portfólio #1
 * ============================================
 * CRUD completo, autenticação por token (JWT assinado com HMAC-SHA256),
 * paginação, busca, validação de dados e documentação interativa em /docs.
 *
 * Zero dependências: usa apenas módulos nativos do Node.js.
 * Rodar:  npm start  →  http://localhost:3000/docs
 */

import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE
  ? fileURLToPath(new URL(process.env.DATA_FILE, import.meta.url))
  : fileURLToPath(new URL("./data.json", import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || "segredo-dev-troque-em-producao";
const TOKEN_TTL_SEG = 60 * 60; // 1 hora

/* ------------------------------------------------------------------ */
/* "Banco de dados" em arquivo JSON (substitua por SQLite/Postgres)    */
/* ------------------------------------------------------------------ */

function carregarDb() {
  if (existsSync(DATA_FILE)) {
    try {
      return JSON.parse(readFileSync(DATA_FILE, "utf8"));
    } catch {
      /* arquivo corrompido → recria */
    }
  }
  return {
    livros: [
      { id: randomUUID(), titulo: "Clean Code", autor: "Robert C. Martin", ano: 2008, genero: "Tecnologia" },
      { id: randomUUID(), titulo: "Dom Casmurro", autor: "Machado de Assis", ano: 1899, genero: "Literatura" },
      { id: randomUUID(), titulo: "O Segredo do Oráculo", autor: "Mario Persona", ano: 2019, genero: "Negócios" },
    ],
  };
}

const db = carregarDb();

function salvarDb() {
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

/* ------------------------------------------------------------------ */
/* Senhas e token (JWT)                                                */
/* ------------------------------------------------------------------ */

const hashSenha = (senha, salt = randomUUID()) =>
  `${salt}:${scryptSync(senha, salt, 32).toString("hex")}`;

const confereSenha = (senha, armazenado) => {
  const [salt, hash] = armazenado.split(":");
  const tentativa = scryptSync(senha, salt, 32);
  const correta = Buffer.from(hash, "hex");
  return tentativa.length === correta.length && timingSafeEqual(tentativa, correta);
};

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

function assinarToken(payload) {
  const corpo = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}`;
  const assinatura = createHmac("sha256", JWT_SECRET).update(corpo).digest("base64url");
  return `${corpo}.${assinatura}`;
}

function conferirToken(token) {
  const partes = (token || "").split(".");
  if (partes.length !== 3) return null;
  const corpo = `${partes[0]}.${partes[1]}`;
  const esperada = createHmac("sha256", JWT_SECRET).update(corpo).digest("base64url");
  if (esperada !== partes[2]) return null; // token adulterado
  try {
    const payload = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expirado
    return payload;
  } catch {
    return null;
  }
}

// usuário demonstração (em produção: tabela usuarios + hash no banco)
const usuarios = [{ id: randomUUID(), usuario: "admin", senhaHash: hashSenha("admin123") }];

/* ------------------------------------------------------------------ */
/* Utilidades HTTP                                                     */
/* ------------------------------------------------------------------ */

function json(res, status, dados) {
  const corpo = JSON.stringify(dados, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(corpo),
  });
  res.end(corpo);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let bruto = "";
    req.on("data", (parte) => {
      bruto += parte;
      if (bruto.length > 1_000_000) {
        reject(new Error("corpo maior que 1 MB"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!bruto) return resolve({});
      try {
        resolve(JSON.parse(bruto));
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

/* ------------------------------------------------------------------ */
/* Validação de livro                                                  */
/* ------------------------------------------------------------------ */

function validarLivro(dados) {
  const erros = [];
  if (typeof dados.titulo !== "string" || dados.titulo.trim().length < 2) {
    erros.push({ campo: "titulo", erro: "obrigatório, mínimo 2 caracteres" });
  }
  if (typeof dados.autor !== "string" || dados.autor.trim().length < 2) {
    erros.push({ campo: "autor", erro: "obrigatório, mínimo 2 caracteres" });
  }
  const ano = Number(dados.ano);
  if (!Number.isInteger(ano) || ano < 1450 || ano > new Date().getFullYear() + 1) {
    erros.push({ campo: "ano", erro: "inteiro entre 1450 e o ano atual" });
  }
  if (typeof dados.genero !== "string" || dados.genero.trim().length < 2) {
    erros.push({ campo: "genero", erro: "obrigatório, mínimo 2 caracteres" });
  }
  return erros;
}

/* ------------------------------------------------------------------ */
/* Rotas                                                               */
/* ------------------------------------------------------------------ */

const ROTAS = [
  { metodo: "GET", caminho: "/health", publico: true },
  { metodo: "POST", caminho: "/login", publico: true },
  { metodo: "GET", caminho: "/livros", publico: true },
  { metodo: "GET", caminho: "/livros/:id", publico: true },
  { metodo: "POST", caminho: "/livros", publico: false },
  { metodo: "PUT", caminho: "/livros/:id", publico: false },
  { metodo: "DELETE", caminho: "/livros/:id", publico: false },
];

function casaCaminho(padrao, real) {
  const p1 = padrao.split("/");
  const p2 = real.split("/");
  if (p1.length !== p2.length) return null;
  const params = {};
  for (let i = 0; i < p1.length; i++) {
    if (p1[i].startsWith(":")) params[p1[i].slice(1)] = decodeURIComponent(p2[i]);
    else if (p1[i] !== p2[i]) return null;
  }
  return params;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const rota = ROTAS.find((r) => r.metodo === req.method && casaCaminho(r.caminho, url.pathname));

  // página de documentação
  if (req.method === "GET" && url.pathname === "/docs") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(readFileSync(fileURLToPath(new URL("./docs.html", import.meta.url)), "utf8"));
    return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(302, { Location: "/docs" });
    res.end();
    return;
  }

  if (!rota) return json(res, 404, { erro: "rota não encontrada", dica: "veja /docs" });

  // autenticação
  if (!rota.publico) {
    const cabecalho = req.headers.authorization || "";
    const payload = conferirToken(cabecalho.replace(/^Bearer /, ""));
    if (!payload) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return json(res, 401, { erro: "token ausente, inválido ou expirado" });
    }
    req.usuario = payload.usuario;
  }

  try {
    switch (`${req.method} ${rota.caminho}`) {
      case "GET /health":
        return json(res, 200, {
          status: "ok",
          uptime: Math.round(process.uptime()),
          livrosCadastrados: db.livros.length,
        });

      case "POST /login": {
        const corpo = await lerCorpo(req);
        const u = usuarios.find((x) => x.usuario === corpo.usuario);
        if (!u || !confereSenha(String(corpo.senha || ""), u.senhaHash)) {
          return json(res, 401, { erro: "usuário ou senha inválidos" });
        }
        const agora = Math.floor(Date.now() / 1000);
        return json(res, 200, {
          token: assinarToken({ sub: u.id, usuario: u.usuario, iat: agora, exp: agora + TOKEN_TTL_SEG }),
          expiraEm: `${TOKEN_TTL_SEG / 60} min`,
        });
      }

      case "GET /livros": {
        const pagina = Math.max(1, Number(url.searchParams.get("page")) || 1);
        const limite = Math.min(50, Math.max(1, Number(url.searchParams.get("limite")) || 10));
        const busca = (url.searchParams.get("busca") || "").toLowerCase().trim();
        const genero = (url.searchParams.get("genero") || "").toLowerCase().trim();

        let lista = db.livros;
        if (busca) lista = lista.filter((l) => `${l.titulo} ${l.autor}`.toLowerCase().includes(busca));
        if (genero) lista = lista.filter((l) => l.genero.toLowerCase() === genero);

        const total = lista.length;
        const itens = lista.slice((pagina - 1) * limite, pagina * limite);
        return json(res, 200, {
          pagina, limite, total, totalPaginas: Math.max(1, Math.ceil(total / limite)), itens,
        });
      }

      case "GET /livros/:id": {
        const { id } = casaCaminho("/livros/:id", url.pathname);
        const livro = db.livros.find((l) => l.id === id);
        if (!livro) return json(res, 404, { erro: "livro não encontrado" });
        return json(res, 200, livro);
      }

      case "POST /livros": {
        const corpo = await lerCorpo(req);
        const erros = validarLivro(corpo);
        if (erros.length) return json(res, 422, { erros });
        const livro = {
          id: randomUUID(),
          titulo: corpo.titulo.trim(),
          autor: corpo.autor.trim(),
          ano: Number(corpo.ano),
          genero: corpo.genero.trim(),
          criadoPor: req.usuario,
        };
        db.livros.push(livro);
        salvarDb();
        return json(res, 201, livro);
      }

      case "PUT /livros/:id": {
        const { id } = casaCaminho("/livros/:id", url.pathname);
        const livro = db.livros.find((l) => l.id === id);
        if (!livro) return json(res, 404, { erro: "livro não encontrado" });
        const corpo = await lerCorpo(req);
        const erros = validarLivro({ ...livro, ...corpo });
        if (erros.length) return json(res, 422, { erros });
        Object.assign(livro, {
          titulo: String(corpo.titulo ?? livro.titulo).trim(),
          autor: String(corpo.autor ?? livro.autor).trim(),
          ano: Number(corpo.ano ?? livro.ano),
          genero: String(corpo.genero ?? livro.genero).trim(),
        });
        salvarDb();
        return json(res, 200, livro);
      }

      case "DELETE /livros/:id": {
        const { id } = casaCaminho("/livros/:id", url.pathname);
        const indice = db.livros.findIndex((l) => l.id === id);
        if (indice === -1) return json(res, 404, { erro: "livro não encontrado" });
        const [removido] = db.livros.splice(indice, 1);
        salvarDb();
        return json(res, 200, { removido: removido.titulo, id });
      }

      default:
        return json(res, 405, { erro: "método não permitido" });
    }
  } catch (e) {
    return json(res, 400, { erro: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`📚 API de Livros rodando em  http://localhost:${PORT}/docs`);
});

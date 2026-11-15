/**
 * Testes automatizados da API de Livros.
 * Sobe o servidor numa porta de teste com um banco temporário,
 * exercita todas as rotas e derruba o processo no fim.
 * Rodar: npm test
 */

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

let passou = 0;
let falhou = 0;
const falhas = [];

function ok(nome, cond, extra = "") {
  if (cond) {
    passou++;
    console.log(`  ✓ ${nome}`);
  } else {
    falhou++;
    falhas.push(`${nome}${extra ? ` — ${extra}` : ""}`);
    console.log(`  ✗ ${nome} ${extra}`);
  }
}

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarServidor() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch {
      /* servidor ainda não subiu */
    }
    await dorme(150);
  }
  return false;
}

console.log("▶ Subindo servidor de teste na porta 3100…");
const servidor = spawn(process.execPath, ["server.js"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_FILE: "./data-test.json",
    JWT_SECRET: "segredo-dos-testes",
  },
  stdio: "ignore",
});

let token = "";

try {
  if (!(await esperarServidor())) throw new Error("servidor não respondeu em ~8 s");

  console.log("\n— Infraestrutura");
  {
    const res = await fetch(`${BASE}/health`);
    const corpo = await res.json();
    ok("GET /health → 200", res.status === 200);
    ok("health informa status/uptime", corpo.status === "ok" && typeof corpo.uptime === "number");
  }
  {
    const res = await fetch(`${BASE}/docs`);
    const texto = await res.text();
    ok("GET /docs → 200 com a página", res.status === 200 && texto.includes("API de"));
  }
  {
    const res = await fetch(`${BASE}/`, { redirect: "manual" });
    ok("GET / → 302 para /docs", res.status === 302 && res.headers.get("location") === "/docs");
  }
  {
    const res = await fetch(`${BASE}/rota-que-nao-existe`);
    ok("rota inexistente → 404", res.status === 404);
  }

  console.log("\n— Autenticação");
  {
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: "admin", senha: "errada" }),
    });
    ok("login com senha errada → 401", res.status === 401);
  }
  {
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: "admin", senha: "admin123" }),
    });
    const corpo = await res.json();
    ok("login correto → 200 + token", res.status === 200 && typeof corpo.token === "string");
    token = corpo.token;
  }
  {
    const res = await fetch(`${BASE}/livros`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token.adulterado.aqui",
      },
      body: JSON.stringify({}),
    });
    ok("token inválido em rota protegida → 401", res.status === 401);
  }

  console.log("\n— Leitura (público)");
  {
    const res = await fetch(`${BASE}/livros`);
    const corpo = await res.json();
    ok("GET /livros → 200 com lista", res.status === 200 && Array.isArray(corpo.itens));
    ok("livros semeados presentes", corpo.total >= 3);
    ok("campos de paginação presentes", typeof corpo.pagina === "number" && typeof corpo.totalPaginas === "number");
  }
  {
    const res = await fetch(`${BASE}/livros?busca=clean`);
    const corpo = await res.json();
    ok("busca por 'clean' encontra", corpo.total >= 1 && corpo.itens.some((l) => /clean/i.test(l.titulo)));
  }
  {
    const res = await fetch(`${BASE}/livros?genero=Tecnologia`);
    const corpo = await res.json();
    ok("filtro por gênero", corpo.itens.every((l) => l.genero.toLowerCase() === "tecnologia"));
  }
  {
    const res = await fetch(`${BASE}/livros?limite=1&page=2`);
    const corpo = await res.json();
    ok("paginação limite=1 página=2", corpo.itens.length === 1 && corpo.pagina === 2);
  }
  let idLivro = "";
  {
    const lista = await (await fetch(`${BASE}/livros`)).json();
    idLivro = lista.itens[0].id;
    const res = await fetch(`${BASE}/livros/${idLivro}`);
    const corpo = await res.json();
    ok("GET /livros/:id → 200", res.status === 200 && corpo.id === idLivro);
  }
  {
    const res = await fetch(`${BASE}/livros/id-que-nao-existe`);
    ok("GET livro inexistente → 404", res.status === 404);
  }

  console.log("\n— Escrita (protegido)");
  {
    const res = await fetch(`${BASE}/livros`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: "X", autor: "Y", ano: 2000, genero: "Z" }),
    });
    ok("POST sem token → 401", res.status === 401);
  }
  {
    const res = await fetch(`${BASE}/livros`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ titulo: "A", autor: "B", ano: 900, genero: "" }),
    });
    const corpo = await res.json();
    ok("POST inválido → 422 com detalhes", res.status === 422 && Array.isArray(corpo.erros) && corpo.erros.length >= 2);
  }
  let idCriado = "";
  {
    const res = await fetch(`${BASE}/livros`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ titulo: "A Hopscotch", autor: "Julio Cortázar", ano: 1963, genero: "Literatura" }),
    });
    const corpo = await res.json();
    ok("POST válido → 201 com id", res.status === 201 && typeof corpo.id === "string");
    idCriado = corpo.id;
  }
  {
    const res = await fetch(`${BASE}/livros/${idCriado}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ano: 1966 }),
    });
    const corpo = await res.json();
    ok("PUT parcial preserva campos → 200", res.status === 200 && corpo.ano === 1966 && corpo.titulo === "A Hopscotch");
  }
  {
    const res = await fetch(`${BASE}/livros/${idCriado}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ano: 30 }),
    });
    ok("PUT inválido → 422", res.status === 422);
  }
  {
    const res = await fetch(`${BASE}/livros/${idCriado}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const corpo = await res.json();
    ok("DELETE → 200", res.status === 200 && corpo.removido === "A Hopscotch");
  }
  {
    const res = await fetch(`${BASE}/livros/${idCriado}`);
    ok("GET após DELETE → 404", res.status === 404);
  }
} catch (e) {
  falhou++;
  falhas.push(`erro inesperado: ${e.message}`);
  console.error("✗", e);
} finally {
  servidor.kill();
  await dorme(300);
  rmSync(fileURLToPath(new URL("../data-test.json", import.meta.url)), { force: true });
}

console.log(`\n═══ Resultado: ${passou} passaram · ${falhou} falharam ═══`);
if (falhas.length) {
  console.log("Falhas:");
  for (const f of falhas) console.log("  -", f);
}
process.exit(falhou ? 1 : 0);

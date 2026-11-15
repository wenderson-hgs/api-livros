# 📚 API de Livros

**API REST completa de catálogo de livros** — CRUD, autenticação JWT, paginação,
busca, validação detalhada e **documentação interativa**. Feita em **Node.js
puro, com zero dependências de terceiros** (apenas módulos nativos).

![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![deps](https://img.shields.io/badge/depend%C3%AAncias-0-blueviolet)
![licença](https://img.shields.io/badge/licen%C3%A7a-MIT-yellow)

## ✨ Destaques

- **CRUD completo** de livros (`/livros`)
- **Autenticação por token JWT** assinado com HMAC-SHA256 (`node:crypto`) —
  sem biblioteca externa, implementado do zero
- **Hash de senha com scrypt** + comparação em tempo constante
  (`timingSafeEqual`)
- **Paginação, busca textual e filtro por gênero**
- **Validação de entrada** com respostas `422` detalhadas campo a campo
- **Documentação interativa em `/docs`** — dá para logar e disparar requisições
  de dentro da própria página, com respostas formatadas
- **Testes de integração** (`npm test`) que sobem o servidor numa porta
  própria, exercitam todas as rotas (incluindo casos de erro) e limpam o banco
  temporário
- Persistência simples em `data.json` — fácil trocar por SQLite/Postgres

## 🚀 Como rodar

```bash
npm start
```

Abra **http://localhost:3000/docs** — a página de documentação já permite
autenticar e testar todos os endpoints pelo navegador.

**Usuário de demonstração:** `admin` / `admin123`

## 🔌 Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/health` | — | Status do serviço (uptime, nº de livros) |
| `POST` | `/login` | — | Troca usuário/senha por um token JWT (expira em 1 h) |
| `GET` | `/livros` | — | Lista com paginação: `?page`, `?limite`, `?busca`, `?genero` |
| `GET` | `/livros/:id` | — | Detalhe de um livro |
| `POST` | `/livros` | 🔒 | Cria livro (`titulo`, `autor`, `ano`, `genero`) |
| `PUT` | `/livros/:id` | 🔒 | Atualização parcial (envie só o que mudou) |
| `DELETE` | `/livros/:id` | 🔒 | Remove o livro |

🔒 = precisa do cabeçalho `Authorization: Bearer <token>`

## 🧪 Exemplos rápidos (curl)

```bash
# 1. Obter token
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin","senha":"admin123"}'

# 2. Criar um livro (com o token devolvido acima)
curl -X POST http://localhost:3000/livros \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{"titulo":"O Cortiço","autor":"Aluísio Azevedo","ano":1890,"genero":"Literatura"}'

# 3. Buscar e paginar (rota pública)
curl "http://localhost:3000/livros?busca=machado&limite=5&page=1"
```

## ⚙️ Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta do servidor |
| `JWT_SECRET` | *(troque em produção!)* | Segredo de assinatura dos tokens |
| `DATA_FILE` | `./data.json` | Arquivo do "banco" JSON (os testes usam um temporário) |

## 🗂 Estrutura

```
api-livros/
├── server.js          # API completa (rotas, auth, validação, persistência)
├── docs.html          # Documentação interativa servida em /docs
├── scripts/
│   └── test.mjs       # Suíte que sobe o servidor e valida todas as rotas
└── data.json          # "Banco" JSON (gerado em runtime, fora do git)
```

## 🎯 O que este projeto demonstra

- Modelagem de **API REST** consistente, com status codes corretos
  (`200 / 201 / 400 / 401 / 404 / 422 / 405`)
- **JWT implementado na mão** — entendo o que acontece por baixo da biblioteca
  `jsonwebtoken` (header.payload.signature, exp, HMAC)
- **Segurança básica real**: hash scrypt de senha, comparação em tempo
  constante, rotas protegidas por token
- **Testes de integração** de ponta a ponta (servidor real, requisições HTTP)
- **Documentação pensada para quem consome** — inclusive com testador embutido

## 🧭 Próximos passos possíveis

- Migrar persistência para SQLite (`node:sqlite`)
- Rate limiting e refresh token
- OpenAPI/Swagger gerado automaticamente

## Licença

MIT — Wenderson

# Painel de Limpeza

Dashboard de monitoramento do script de limpeza e otimização de PCs.

## Estrutura do Projeto

```
painel-limpeza/
├── src/
│   ├── main.jsx          # Entry point React
│   ├── App.jsx            # Componente principal (dashboard)
│   ├── components.jsx     # Componentes reutilizáveis (KPI, badges, charts)
│   ├── useApiData.js      # Hook de fetch + auto-refresh + fallback
│   ├── config.js          # ⚙️  URL da API e intervalo de refresh
│   ├── theme.js           # Cores e constantes visuais
│   └── fallbackData.js    # Dados offline de fallback
├── index.html
├── vite.config.js
├── package.json
├── nginx.conf             # Config de exemplo para deploy
└── README.md
```

---

## 1. Configurar a API no N8N

Crie um novo workflow com 3 nós:

### Nó 1 — Webhook
- Tipo: **Webhook**
- Método: `GET`
- Path: `painel-limpeza`
- Authentication: None (ou Basic Auth se preferir)
- Response Mode: **Using 'Respond to Webhook' Node**

### Nó 2 — MySQL
- Tipo: **MySQL**
- Operation: `Execute Query`
- Query:
```sql
SELECT * FROM vw_painel_limpeza
WHERE asset_tag IS NOT NULL AND asset_tag != ''
ORDER BY saude_limpeza DESC, colaborador ASC
```

### Nó 3 — Respond to Webhook
- Tipo: **Respond to Webhook**
- Respond With: **All Incoming Items**

**Conecte:** Webhook → MySQL → Respond to Webhook

**Ative o workflow** e teste acessando:
```
https://webhook.rt-automations.com.br/webhook/painel-limpeza
```

Deve retornar um JSON com os dados da view.

---

## 2. Configurar a URL no Projeto

Edite `src/config.js` e ajuste a URL se necessário:

```js
export const API_URL = "https://webhook.rt-automations.com.br/webhook/painel-limpeza";
export const REFRESH_INTERVAL = 60_000; // 60 segundos
```

---

## 3. Build e Deploy na VPS

### Na sua máquina local (ou na VPS se tiver Node.js):

```bash
# Instalar dependências
npm install

# Testar localmente
npm run dev
# Acesse http://localhost:3000

# Gerar build de produção
npm run build
```

### Na VPS:

```bash
# Copiar o build para o servidor (da sua máquina local)
scp -r dist/* usuario@sua-vps:/var/www/painel-limpeza/

# Ou se fez o build na própria VPS:
cp -r dist/* /var/www/painel-limpeza/

# Copiar config do Nginx
sudo cp nginx.conf /etc/nginx/sites-available/painel-limpeza
sudo ln -sf /etc/nginx/sites-available/painel-limpeza /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Acessar:

```
http://painel.rt-automations.com.br
```

(Ou o domínio/IP que configurar no Nginx)

---

## 4. Funcionalidades

- **Auto-refresh**: Atualiza dados a cada 60s (configurável)
- **Fallback offline**: Se a API cair, exibe dados locais sem quebrar
- **Indicador de conexão**: Verde = API online, Amarelo = offline
- **Busca**: Por nome, hostname, email ou localização
- **Filtros**: Por saúde (Crítico / Em dia) e por localização
- **Ordenação**: Clique nos cabeçalhos da tabela
- **Detalhes**: Clique em qualquer linha para ver detalhes completos
- **Gráficos**: Donut de saúde, barras por localização, categorias

---

## 5. Manutenção

### Atualizar dados de fallback
Se adicionar muitos PCs, atualize `src/fallbackData.js` com uma amostra recente.

### Adicionar HTTPS
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d painel.rt-automations.com.br
```

### Adicionar autenticação básica (opcional)
No `nginx.conf`, adicione dentro do `location /`:
```nginx
auth_basic "Painel TI";
auth_basic_user_file /etc/nginx/.htpasswd;
```

Crie o arquivo de senha:
```bash
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd admin
```


# Music Horizon - React

Uma aplicação moderna de descoberta musical que utiliza Last.fm para recomendações e Spotify para reprodução e exportação de playlists.

## 🎵 Funcionalidades

- **Busca Inteligente**: Busque por artista, música ou gênero
- **Recomendações Personalizadas**: Descubra novas músicas baseadas em Last.fm
- **Reprodução Integrada**: Ouça as músicas diretamente no navegador via Spotify Web Playback SDK
- **Gerenciamento de Playlists**: Crie e organize suas descobertas
- **Exportação para Spotify**: Salve suas playlists automaticamente no Spotify

## 🚀 Instalação

### Pré-requisitos

- Node.js 16+ instalado
- Conta no Spotify Premium (necessário para Web Playback SDK)
- Credenciais de API do Spotify e Last.fm

### 1. Obter Credenciais de API

#### Spotify (obrigatório)
1. Acesse [Spotify for Developers](https://developer.spotify.com/dashboard)
2. Crie um novo app
3. Anote o **Client ID**
4. Em "Edit Settings", adicione `http://127.0.0.1:5173/callback` em **Redirect URIs**
5. Em "Users and Access", adicione seu email do Spotify (modo desenvolvimento)

#### Last.fm (obrigatório)
1. Acesse [Last.fm API](https://www.last.fm/api/account/create)
2. Crie uma conta de API
3. Anote a **API Key**

### 2. Configurar o Projeto

```bash
# Já instalado, mas caso precise reinstalar:
npm install

# Criar arquivo .env com suas credenciais
cp .env.example .env
```

### 3. Editar o arquivo `.env`

Abra o arquivo `.env` e adicione suas credenciais:

```env
VITE_SPOTIFY_CLIENT_ID=seu_client_id_aqui
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
VITE_LASTFM_API_KEY=sua_api_key_aqui
```

### 4. Executar o Projeto

```bash
npm run dev
```

A aplicação estará disponível em: `http://localhost:5173`

## 📖 Como Usar

1. **Login**: Conecte-se com sua conta do Spotify
2. **Buscar**: Digite o nome de um artista, música ou gênero (ex: "Arctic Monkeys", "Indie Rock")
3. **Explorar**: Veja as recomendações geradas pelo Last.fm
4. **Ouvir**: Clique no botão play para reproduzir no Spotify
5. **Criar Playlist**: Salve suas descobertas em uma playlist
6. **Exportar**: Envie a playlist para sua biblioteca do Spotify

## 🏗️ Estrutura do Projeto

```
src/
├── services/         # APIs e lógica de negócio
│   ├── spotify.js    # Serviço Spotify (OAuth, Playback, Playlists)
│   ├── lastfm.js     # Serviço Last.fm (Recomendações)
│   └── recommendations.js  # Engine de recomendações
├── stores/           # State management com Zustand
│   ├── authStore.js  # Autenticação
│   ├── playerStore.js  # Player de música
│   └── playlistStore.js  # Playlists
├── components/       # Componentes React
│   ├── Layout/       # Layout (Sidebar, Header)
│   └── Player/       # Player e TrackCard
├── pages/            # Páginas da aplicação
│   ├── Login.jsx
│   ├── Callback.jsx
│   ├── Dashboard.jsx
│   ├── Search.jsx
│   ├── Playlists.jsx
│   └── Profile.jsx
└── App.jsx           # Componente principal e rotas
```

## 🔧 Tecnologias

- **React 18** - Framework UI
- **Vite** - Build tool
- **React Router** - Navegação
- **Zustand** - State management
- **Tailwind CSS** - Estilização
- **Spotify Web API** - Autenticação, Playback, Playlists
- **Last.fm API** - Recomendações musicais

## ⚠️ Limitações Conhecidas

- **Spotify Premium**: Necessário para usar o Web Playback SDK
- **Modo Desenvolvimento**: Limite de 25 usuários no Spotify (você precisa adicionar emails manualmente no dashboard)
- **OAuth Implícito**: Não é ideal para produção (token expira em 1 hora)
- **Músicas não encontradas**: Nem todas as músicas do Last.fm existem no Spotify

## 🎯 Próximos Passos (Melhorias Futuras)

- [ ] Implementar refresh token automático
- [ ] Adicionar filtros de gênero
- [ ] Histórico de buscas
- [ ] Compartilhamento de playlists
- [ ] Dark/Light mode toggle
- [ ] Testes unitários

## 📝 Licença

MIT

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.


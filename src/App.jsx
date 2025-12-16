import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './stores/authStore';
import usePlayerStore from './stores/playerStore';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Callback from './pages/Callback';
import LastFMCallback from './pages/LastFMCallback';
import Dashboard from './pages/Dashboard';
import Search from './pages/Search';
import ForYou from './pages/ForYou';
import GeneratePlaylist from './pages/GeneratePlaylist';
import Playlists from './pages/Playlists';
import Profile from './pages/Profile';
import Toast from './components/Toast';

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const isLoading = useAuthStore(state => state.isLoading);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-dark-bg via-dark-card to-dark-bg">
        <div className="text-center">
          <div className="loader mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-white">Carregando...</h2>
        </div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function App() {
  const init = useAuthStore(state => state.init);
  const spotifyConnected = useAuthStore(state => state.spotifyConnected);
  const token = useAuthStore(state => state.token);
  const initPlayer = usePlayerStore(state => state.initPlayer);

  useEffect(() => {
    init();
  }, [init]);

  // Only init player if Spotify is connected
  useEffect(() => {
    if (spotifyConnected && token) {
      initPlayer(token);
    }
  }, [spotifyConnected, token, initPlayer]);

  return (
    <BrowserRouter>
      <Toast />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/lastfm/callback" element={<LastFMCallback />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="search" element={<Search />} />
          <Route path="for-you" element={<ForYou />} />
          <Route path="generate" element={<GeneratePlaylist />} />
          <Route path="playlists" element={<Playlists />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

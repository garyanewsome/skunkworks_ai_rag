import { useState, useEffect } from 'react';
import { 
  Box, 
  Container, 
  Typography, 
  Button, 
  Card, 
  CardContent,
  CircularProgress,
  ThemeProvider,
  createTheme,
  CssBaseline,
  alpha
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CodeIcon from '@mui/icons-material/Code';

// Define a premium dark theme
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#b29df9', // Pale purple/pink
      light: '#d6c8ff',
      dark: '#8b6ced',
    },
    secondary: {
      main: '#7ce5db', // Minty cyan
    },
    background: {
      default: '#0a0b10', // Deep dark
      paper: '#12141d',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 800,
      letterSpacing: '-0.02em',
    },
    h4: {
      fontWeight: 600,
    }
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          padding: '10px 24px',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.05)',
        }
      }
    }
  },
});

function App() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      setStatus(data.message);
    } catch (err) {
      setError('Failed to connect to backend. Make sure FastAPI is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check health on load
    checkHealth();
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box 
        sx={{ 
          minHeight: '100vh', 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `radial-gradient(circle at 50% -20%, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${theme.palette.background.default} 70%)`,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Decorative background elements */}
        <Box sx={{
          position: 'absolute', top: '10%', left: '10%', width: 400, height: 400,
          background: `radial-gradient(circle, ${alpha(theme.palette.secondary.main, 0.1)} 0%, transparent 70%)`,
          filter: 'blur(40px)', zIndex: 0, pointerEvents: 'none'
        }} />
        <Box sx={{
          position: 'absolute', bottom: '10%', right: '10%', width: 500, height: 500,
          background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.1)} 0%, transparent 70%)`,
          filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none'
        }} />

        <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <Box mb={4}>
            <AutoAwesomeIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h1" gutterBottom sx={{ 
              fontSize: { xs: '3rem', md: '5rem' },
              background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.secondary.main} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Skunkworks RAG
            </Typography>
            <Typography variant="h5" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', mb: 6, fontWeight: 300, lineHeight: 1.6 }}>
              The foundational architecture for your AI exploration. 
              Python backend meets React frontend.
            </Typography>
          </Box>

          <Card elevation={0} sx={{ p: 2, maxWidth: 500, mx: 'auto', backdropFilter: 'blur(20px)', backgroundColor: alpha(theme.palette.background.paper, 0.7) }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="center" mb={3}>
                <CodeIcon sx={{ mr: 1, color: 'text.secondary' }} />
                <Typography variant="h6" component="div">
                  Backend Status
                </Typography>
              </Box>

              <Box 
                sx={{ 
                  p: 3, 
                  borderRadius: 2, 
                  bgcolor: 'background.default',
                  border: '1px solid',
                  borderColor: status ? 'success.dark' : error ? 'error.dark' : 'divider',
                  minHeight: 100,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 3
                }}
              >
                {loading ? (
                  <CircularProgress size={30} color="primary" />
                ) : error ? (
                  <Typography color="error" variant="body1">{error}</Typography>
                ) : status ? (
                  <Typography color="success.main" variant="h6" fontWeight="bold">
                    {status}
                  </Typography>
                ) : (
                  <Typography color="text.secondary">Waiting for status...</Typography>
                )}
              </Box>

              <Button 
                variant="contained" 
                color="primary" 
                size="large" 
                onClick={checkHealth}
                disabled={loading}
                fullWidth
                sx={{ py: 1.5 }}
              >
                Ping Backend API
              </Button>
            </CardContent>
          </Card>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;

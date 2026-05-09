import { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  CircularProgress,
  ThemeProvider,
  createTheme,
  CssBaseline,
  alpha,
  Chip,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  IconButton,
  useMediaQuery,
  AppBar,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import BiotechIcon from '@mui/icons-material/Biotech';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import MenuIcon from '@mui/icons-material/Menu';
import QuizIcon from '@mui/icons-material/Quiz';
import { LectureRagPanel } from './components/LectureRagPanel';
import { GraderPanel } from './components/GraderPanel';
import { VisualizePanel } from './components/VisualizePanel';
import { SourceOfTruthPanel } from './components/SourceOfTruthPanel';
import { QuizzPanel } from './components/QuizzPanel';

const drawerWidth = 260;

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#b29df9',
      light: '#d6c8ff',
      dark: '#8b6ced',
    },
    secondary: {
      main: '#7ce5db',
    },
    background: {
      default: '#0a0b10',
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
    },
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
        },
      },
    },
  },
});

type AppView = 'prompt' | 'grader' | 'visualize' | 'source' | 'quizz';

function App() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [view, setView] = useState<AppView>('prompt');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => {
        if (!cancelled) setBackendOk(r.ok);
      })
      .catch(() => {
        if (!cancelled) setBackendOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const drawerPaperSx = {
    width: drawerWidth,
    boxSizing: 'border-box' as const,
    borderRight: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: alpha(theme.palette.background.paper, 0.92),
    backdropFilter: 'blur(12px)',
  };

  const navList = (
    <Box sx={{ pt: 2 }}>
      <Typography
        variant="overline"
        sx={{
          px: 2.5,
          mb: 1,
          display: 'block',
          letterSpacing: '0.14em',
          color: 'text.secondary',
          fontSize: '0.68rem',
        }}
      >
        Workspace
      </Typography>
      <List dense sx={{ px: 1 }}>
        <ListItemButton
          selected={view === 'prompt'}
          onClick={() => {
            setView('prompt');
            setMobileNavOpen(false);
          }}
          sx={{ borderRadius: 2, mb: 0.5 }}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>
            <ChatBubbleOutlineIcon color={view === 'prompt' ? 'primary' : 'inherit'} />
          </ListItemIcon>
          <ListItemText primary="Prompt" secondary="Lecture transcripts" />
        </ListItemButton>
        <ListItemButton
          selected={view === 'grader'}
          onClick={() => {
            setView('grader');
            setMobileNavOpen(false);
          }}
          sx={{ borderRadius: 2, mb: 0.5 }}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>
            <FactCheckIcon color={view === 'grader' ? 'primary' : 'inherit'} />
          </ListItemIcon>
          <ListItemText primary="Grader" secondary="Homework rubric" />
        </ListItemButton>
        <ListItemButton
          selected={view === 'visualize'}
          onClick={() => {
            setView('visualize');
            setMobileNavOpen(false);
          }}
          sx={{ borderRadius: 2, mb: 0.5 }}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>
            <BiotechIcon color={view === 'visualize' ? 'primary' : 'inherit'} />
          </ListItemIcon>
          <ListItemText primary="Visualize" secondary="Interactive canvas" />
        </ListItemButton>
        <ListItemButton
          selected={view === 'source'}
          onClick={() => {
            setView('source');
            setMobileNavOpen(false);
          }}
          sx={{ borderRadius: 2, mb: 0.5 }}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>
            <MenuBookIcon color={view === 'source' ? 'primary' : 'inherit'} />
          </ListItemIcon>
          <ListItemText primary="Source of truth" secondary="PDF books & pages" />
        </ListItemButton>
        <ListItemButton
          selected={view === 'quizz'}
          onClick={() => {
            setView('quizz');
            setMobileNavOpen(false);
          }}
          sx={{ borderRadius: 2 }}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>
            <QuizIcon color={view === 'quizz' ? 'primary' : 'inherit'} />
          </ListItemIcon>
          <ListItemText primary="Quizz" secondary="Recall & spaced review" />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          background: `radial-gradient(circle at 50% -20%, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${theme.palette.background.default} 70%)`,
          position: 'relative',
          overflowX: 'hidden',
          overflowY: 'auto',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: '10%',
            left: '10%',
            width: 400,
            height: 400,
            background: `radial-gradient(circle, ${alpha(theme.palette.secondary.main, 0.1)} 0%, transparent 70%)`,
            filter: 'blur(40px)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: '10%',
            right: '10%',
            width: 500,
            height: 500,
            background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.1)} 0%, transparent 70%)`,
            filter: 'blur(60px)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />

        {!isMdUp ? (
          <AppBar
            position="fixed"
            elevation={0}
            sx={{
              zIndex: (t) => t.zIndex.drawer + 1,
              bgcolor: alpha(theme.palette.background.paper, 0.85),
              backdropFilter: 'blur(12px)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <Toolbar>
              <IconButton
                color="inherit"
                edge="start"
                aria-label="Open navigation"
                onClick={() => setMobileNavOpen(true)}
                sx={{ mr: 1 }}
              >
                <MenuIcon />
              </IconButton>
              <AutoAwesomeIcon sx={{ fontSize: 28, color: 'primary.main', mr: 1.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
                Skunkworks
              </Typography>
              {backendOk === null ? (
                <CircularProgress size={22} />
              ) : (
                <Chip
                  size="small"
                  label={backendOk ? 'API online' : 'API offline'}
                  color={backendOk ? 'success' : 'error'}
                  variant="outlined"
                />
              )}
            </Toolbar>
          </AppBar>
        ) : null}

        <Drawer
          variant={isMdUp ? 'permanent' : 'temporary'}
          open={isMdUp ? true : mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            zIndex: (t) => (isMdUp ? t.zIndex.drawer : t.zIndex.modal),
            '& .MuiDrawer-paper': drawerPaperSx,
          }}
        >
          <Box sx={{ px: 1.5, pt: isMdUp ? 3 : 2, pb: 2 }}>
            {isMdUp ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, mb: 2 }}>
                <AutoAwesomeIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                    Skunkworks
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    RAG & grading
                  </Typography>
                </Box>
              </Box>
            ) : null}
            {navList}
          </Box>
        </Drawer>

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
            position: 'relative',
            zIndex: 1,
            pt: { xs: '64px', md: 0 },
            minHeight: '100vh',
          }}
        >
          <Container
            maxWidth={view === 'visualize' || view === 'quizz' ? false : 'lg'}
            sx={{
              py: view === 'visualize' || view === 'quizz' ? { xs: 2, md: 3 } : { xs: 3, md: 5 },
              flex: 1,
              px: view === 'visualize' || view === 'quizz' ? { xs: 1.5, sm: 2, md: 3 } : undefined,
            }}
          >
            {isMdUp ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  justifyContent: 'space-between',
                  gap: 2,
                  mb: 4,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <AutoAwesomeIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                  <Box>
                    <Typography
                      variant="h4"
                      sx={{
                        fontWeight: 800,
                        background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.secondary.main} 100%)`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      Skunkworks RAG
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {view === 'prompt'
                        ? 'Ask ingested lecture transcripts; browse matching clips.'
                        : view === 'grader'
                          ? 'Paste or upload homework; get professor-style feedback and a letter grade.'
                          : view === 'visualize'
                            ? 'Prompt-driven canvas: drag objects, attach and detach bonds or links.'
                            : view === 'source'
                              ? 'Search OCR-backed PDF chunks with page citations.'
                              : 'Build a deck, practice recall, spaced repetition, timed challenges, and sandbox experiments.'}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {backendOk === null ? (
                    <CircularProgress size={22} />
                  ) : (
                    <Chip
                      size="small"
                      label={backendOk ? 'API online' : 'API offline'}
                      color={backendOk ? 'success' : 'error'}
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {view === 'prompt'
                  ? 'Ask ingested lecture transcripts; browse matching clips.'
                  : view === 'grader'
                    ? 'Paste or upload homework; get professor-style feedback and a letter grade.'
                    : view === 'visualize'
                      ? 'Prompt-driven canvas: drag objects, attach and detach bonds or links.'
                      : view === 'source'
                        ? 'Search OCR-backed PDF chunks with page citations.'
                        : 'Build a deck, practice recall, spaced repetition, timed challenges, and sandbox experiments.'}
              </Typography>
            )}

            {/* Keep all panels mounted so local state (queries, canvas, uploads) survives sidebar switches */}
            <Box sx={{ display: view === 'prompt' ? 'block' : 'none' }} aria-hidden={view !== 'prompt'}>
              <LectureRagPanel theme={theme} />
            </Box>
            <Box sx={{ display: view === 'grader' ? 'block' : 'none' }} aria-hidden={view !== 'grader'}>
              <GraderPanel theme={theme} />
            </Box>
            <Box sx={{ display: view === 'visualize' ? 'block' : 'none' }} aria-hidden={view !== 'visualize'}>
              <VisualizePanel theme={theme} />
            </Box>
            <Box sx={{ display: view === 'source' ? 'block' : 'none' }} aria-hidden={view !== 'source'}>
              <SourceOfTruthPanel theme={theme} />
            </Box>
            <Box sx={{ display: view === 'quizz' ? 'block' : 'none' }} aria-hidden={view !== 'quizz'}>
              <QuizzPanel theme={theme} />
            </Box>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;

import type { Theme } from '@mui/material/styles';
import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';

type StudyGroupPanelProps = {
  theme: Theme;
};

type MockMember = {
  name: string;
  role: string;
  initials: string;
  tone: 'online' | 'away' | 'host';
};

const MOCK_MEMBERS: MockMember[] = [
  { name: 'You', role: 'Host', initials: 'YO', tone: 'host' },
  { name: 'Alex Chen', role: 'QM · rotation', initials: 'AC', tone: 'online' },
  { name: 'Jordan Kim', role: 'Integrals', initials: 'JK', tone: 'online' },
  { name: 'Sam Rivera', role: 'Break', initials: 'SR', tone: 'away' },
];

const MOCK_ACTIVITY = [
  { who: 'Alex', text: 'Pinned: “Derive commutator for ladder operators”', when: '2 min ago' },
  { who: 'Jordan', text: 'Saved clip · Angular momentum lecture · 14:02', when: '8 min ago' },
  { who: 'You', text: 'Started 25‑min focus block', when: '12 min ago' },
];

/** Visual-only preview of a synchronized study room (no backend). */
export function StudyGroupPanel({ theme }: StudyGroupPanelProps) {
  const paperBorder = `1px solid ${alpha(theme.palette.primary.main, 0.12)}`;

  return (
    <Box sx={{ width: '100%', maxWidth: 1100, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
            Study group
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            QM study hall · Week 6
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 560 }}>
            Mock layout: see who is in the room, what the group is focusing on, and recent actions—before real-time sync
            exists.
          </Typography>
        </Box>
        <Chip label="Preview · no live sync" color="secondary" variant="outlined" sx={{ fontWeight: 600 }} />
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 2,
          border: paperBorder,
          bgcolor: alpha(theme.palette.background.paper, 0.55),
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            Invite code
          </Typography>
          <Chip label="skunk‑QM‑w6" variant="outlined" sx={{ fontFamily: 'monospace', letterSpacing: '0.06em' }} />
          <Button size="small" variant="outlined" disabled>
            Copy link
          </Button>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Focus timer
          </Typography>
          <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
            18:42
          </Typography>
          <Typography variant="caption" color="text.secondary">
            left
          </Typography>
        </Box>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '240px 1fr 280px' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            border: paperBorder,
            bgcolor: alpha(theme.palette.background.paper, 0.5),
          }}
        >
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            In this session
          </Typography>
          <AvatarGroup max={4} sx={{ justifyContent: 'flex-start', mb: 2, '& .MuiAvatar-root': { width: 36, height: 36 } }}>
            {MOCK_MEMBERS.map((m) => (
              <Avatar key={m.name} sx={{ bgcolor: alpha(theme.palette.primary.main, m.tone === 'away' ? 0.25 : 0.45) }}>
                {m.initials}
              </Avatar>
            ))}
          </AvatarGroup>
          <Divider sx={{ my: 1.5, borderColor: alpha(theme.palette.divider, 0.3) }} />
          <StackMembers theme={theme} members={MOCK_MEMBERS} />
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: 2,
            border: paperBorder,
            bgcolor: alpha(theme.palette.secondary.main, 0.04),
          }}
        >
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Shared focus
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Everyone sees the same anchor while studying—here a transcript clip and the pinned question (mock data).
          </Typography>
          <Box
            sx={{
              borderRadius: 1.5,
              overflow: 'hidden',
              border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
              mb: 2,
              position: 'relative',
              pt: '56.25%',
              bgcolor: alpha(theme.palette.background.default, 0.9),
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                px: 2,
                textAlign: 'center',
                gap: 0.5,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Shared video slot
              </Typography>
              <Typography variant="body2" color="text.secondary">
                A live room would mirror the host clip or playlist so everyone stays on the same timestamp.
              </Typography>
            </Box>
          </Box>
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.primary.main, 0.06),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
            }}
          >
            <Typography variant="caption" color="secondary.light" fontWeight={600}>
              Pinned by Alex
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Walk through [J_z, J_+] = ħ J_+ using the lecture definition of angular momentum—why does the ladder step
              size stay ħ?
            </Typography>
          </Paper>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
            <Button size="small" variant="contained" disabled>
              Follow to Prompt
            </Button>
            <Button size="small" variant="outlined" disabled>
              Open in Clips
            </Button>
          </Box>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            border: paperBorder,
            bgcolor: alpha(theme.palette.background.paper, 0.5),
          }}
        >
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Activity
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
            Latest moves everyone would see in sync.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {MOCK_ACTIVITY.map((row) => (
              <Box
                key={`${row.who}-${row.when}`}
                sx={{
                  py: 1,
                  px: 1.25,
                  borderRadius: 1,
                  bgcolor: alpha(theme.palette.background.default, 0.45),
                  border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                }}
              >
                <Typography variant="caption" color="primary.light" fontWeight={600}>
                  {row.who}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {row.text}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {row.when}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      </Box>

      <Paper
        elevation={0}
        sx={{
          mt: 2,
          p: 2,
          borderRadius: 2,
          border: paperBorder,
          bgcolor: alpha(theme.palette.background.paper, 0.45),
        }}
      >
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Room chat
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
          <TextField
            fullWidth
            size="small"
            disabled
            placeholder="Message the group (mock—messages are not sent)"
            sx={{ flex: 1 }}
          />
          <Button variant="contained" disabled>
            Send
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

function StackMembers({ theme, members }: { theme: Theme; members: MockMember[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {members.map((m) => (
        <Box key={m.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(theme.palette.primary.main, m.tone === 'away' ? 0.22 : 0.5) }}>
            {m.initials}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {m.name}
              {m.tone === 'host' ? (
                <Typography component="span" variant="caption" color="secondary.light" sx={{ ml: 0.75 }}>
                  Host
                </Typography>
              ) : null}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {m.role}
            </Typography>
          </Box>
          <CircleIcon
            sx={{
              fontSize: 10,
              color:
                m.tone === 'away'
                  ? alpha(theme.palette.warning.main, 0.8)
                  : alpha(theme.palette.success.main, 0.85),
            }}
          />
        </Box>
      ))}
    </Box>
  );
}

import { memo, useEffect, useMemo } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { keyframes } from "@mui/material/styles";

const tetherWave = keyframes`
  0%, 100% { transform: rotate(-2deg); }
  50% { transform: rotate(2deg); }
`;

function SlashedZero({ sx }: { sx?: object }) {
  return (
    <Box
      component="span"
      sx={{
        position: "relative",
        display: "inline-block",
        mx: { xs: 0.25, sm: 0.5 },
        ...sx,
      }}
    >
      <Box component="span" sx={{ position: "relative", zIndex: 0 }}>
        0
      </Box>
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "118%",
          height: { xs: "0.12em", sm: "0.1em" },
          bgcolor: "rgba(255,255,255,0.92)",
          transform: "translate(-50%, -50%) rotate(-52deg)",
          borderRadius: "2px",
          boxShadow: "0 0 12px rgba(255,255,255,0.35)",
          zIndex: 1,
        }}
      />
    </Box>
  );
}

const NotFoundPageComponent = () => {
  const { pathname } = useLocation();
  const PANEL_PREFIX = process.env.REACT_APP_PANEL_PREFIX || 'x-panel-5661';

  const { backTo, backLabel } = useMemo(() => {
    const isInsidePanel = pathname.startsWith(`/${PANEL_PREFIX}`);
    return {
      backTo: isInsidePanel ? `/${PANEL_PREFIX}/dashboard` : "/",
      backLabel: isInsidePanel ? "Go to Dashboard" : "Go to Homepage",
    };
  }, [pathname, PANEL_PREFIX]);

  useEffect(() => {
    document.title = "404 - Page Not Found";
  }, []);

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        overflow: "hidden",
        bgcolor: "#050a0f",
        color: "#f0f4fa",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url(/shared/images/404-space.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(105deg, rgba(5,10,15,0.75) 0%, rgba(5,10,15,0.35) 45%, rgba(5,10,15,0.2) 100%), radial-gradient(ellipse 70% 60% at 70% 40%, transparent 0%, rgba(5,10,15,0.5) 100%)",
        }}
      />

      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          px: { xs: 3, sm: 5 },
          alignItems: "center",
          textAlign: "center"
        }}
      >
        <Typography
          component="h1"
          sx={{
            fontFamily: '"DM Sans", system-ui, sans-serif',
            fontWeight: 800,
            fontSize: { xs: "4.5rem", sm: "6rem", md: "7.5rem" },
            lineHeight: 0.95,
            letterSpacing: "-0.04em",
            color: "#ffffff",
            textShadow:
              "0 2px 0 rgba(0,0,0,0.25), 0 12px 48px rgba(0,0,0,0.45), 0 0 1px rgba(255,255,255,0.9)",
            mb: 2,
          }}
        >
          <Box component="span" sx={{ display: "inline-flex", alignItems: "baseline" }}>
            4
            <SlashedZero />
            4
          </Box>
        </Typography>

        <Typography
          sx={{
            fontFamily: '"DM Sans", system-ui, sans-serif',
            fontWeight: 600,
            fontSize: { xs: "0.85rem", sm: "0.95rem" },
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.92)",
            textShadow: "0 2px 12px rgba(0,0,0,0.5)",
            mb: 4,
          }}
        >
          Lost in Space
        </Typography>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
          <Button
            component={RouterLink}
            to={backTo}
            variant="outlined"
            size="large"
            sx={{
              px: 3,
              py: 1.25,
              color: "#fff",
              borderColor: "rgba(255,255,255,0.55)",
              borderWidth: 2,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "none",
              fontSize: "1rem",
              "&:hover": {
                borderColor: "#fff",
                bgcolor: "rgba(255,255,255,0.08)",
              },
            }}
          >
            {backLabel}
          </Button>
        </Box>

        <Box
          component="svg"
          viewBox="0 0 400 120"
          sx={{
            mt: 5,
            maxWidth: 360,
            opacity: 0.45,
            animation: `${tetherWave} 6s ease-in-out infinite`,
          }}
          aria-hidden
        >
          <path
            d="M 0 100 Q 80 40 160 70 T 320 50 L 400 20"
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </Box>
      </Box>
    </Box>
  );
};

const NotFoundPage = memo(NotFoundPageComponent);
export default NotFoundPage;

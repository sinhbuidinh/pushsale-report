import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import type { SxProps, Theme } from "@mui/material/styles";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import { HUNGVIET_SMARTHOME_GALLERY_IMAGES } from "../constants/siteGalleryImages";

const palette = {
  bg: "#ffffff",
  bgMuted: "#f5f5f7",
  bgElevated: "#ffffff",
  text: "#1a1a1a",
  textMuted: "rgba(0, 0, 0, 0.62)",
  border: "rgba(0, 0, 0, 0.09)",
  accent: "#b45309",
  accentHover: "#92400e",
  accentSoft: "rgba(180, 83, 9, 0.1)",
  kicker: "#92400e",
};

const fontDisplay = '"Fraunces", "Georgia", serif';
const fontBody = '"DM Sans", system-ui, sans-serif';

const sectionSx: SxProps<Theme> = {
  py: { xs: 6, md: 9 },
};

const SLIDER_INTERVAL_MS = 5500;

const LandingProductSlider = memo(function LandingProductSlider({
  images,
}: {
  images: readonly string[];
}) {
  const { t } = useTranslation(); // Remove namespace if causing TS issues, or ensure types are loaded
  const [index, setIndex] = useState(0);
  const len = images.length;

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + len) % len);
  }, [len]);

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % len);
  }, [len]);

  useEffect(() => {
    if (len <= 1) return undefined;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % len);
    }, SLIDER_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [len]);

  if (len === 0) return null;

  return (
    <Box
      role="region"
      aria-roledescription="carousel"
      aria-label={t("landing:productsShowcaseTitle")}
      sx={{
        position: "relative",
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "#ececec",
        border: `1px solid ${palette.border}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          width: "100%",
          transform: `translateX(-${index * 100}%)`,
          transition: "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {images.map((src, i) => (
          <Box
            key={`${src}-${i}`}
            sx={{
              flex: "0 0 100%",
              position: "relative",
              aspectRatio: { xs: "4 / 3", md: "21 / 9" },
              maxHeight: { md: 420 },
              bgcolor: "#e8e8e8",
            }}
          >
            <Box
              component="img"
              src={src}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              referrerPolicy="no-referrer-when-downgrade"
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
              }}
            />
          </Box>
        ))}
      </Box>

      {len > 1 && (
        <>
          <IconButton
            onClick={goPrev}
            aria-label={t("landing:sliderPrev")}
            sx={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              bgcolor: "rgba(255,255,255,0.92)",
              color: palette.text,
              boxShadow: 1,
              "&:hover": { bgcolor: "#fff" },
            }}
            size="large"
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton
            onClick={goNext}
            aria-label={t("landing:sliderNext")}
            sx={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              bgcolor: "rgba(255,255,255,0.92)",
              color: palette.text,
              boxShadow: 1,
              "&:hover": { bgcolor: "#fff" },
            }}
            size="large"
          >
            <ChevronRightIcon />
          </IconButton>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              position: "absolute",
              bottom: 16,
              left: 0,
              right: 0,
              justifyContent: "center",
              zIndex: 2,
            }}
          >
            {images.map((_, i) => (
              <Box
                key={i}
                component="button"
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1} / ${len}`}
                sx={{
                  width: i === index ? 24 : 10,
                  height: 10,
                  p: 0,
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  bgcolor: i === index ? "#b45309" : "rgba(0, 0, 0, 0.3)",
                  boxShadow: i === index ? "0 0 8px rgba(180, 83, 9, 0.6)" : "none",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  "&:hover": { 
                    bgcolor: i === index ? "#92400e" : "rgba(0, 0, 0, 0.5)",
                    transform: "scale(1.1)"
                  },
                }}
              />
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
});

const CompanyLandingPageComponent = () => {
  const { t, i18n } = useTranslation();

  const productItems = useMemo(() => [
    t("landing:productItems.lighting"),
    t("landing:productItems.security"),
    t("landing:productItems.lock"),
    t("landing:productItems.curtain"),
    t("landing:productItems.audio"),
    t("landing:productItems.appliances"),
    t("landing:productItems.integration"),
  ], [t]);

  const valueItems = useMemo(
    () => [
      {
        icon: <VerifiedOutlinedIcon sx={{ fontSize: 28 }} />,
        titleKey: "landing:values.quality.title",
        bodyKey: "landing:values.quality.body",
      },
      {
        icon: <GroupsOutlinedIcon sx={{ fontSize: 28 }} />,
        titleKey: "landing:values.customer.title",
        bodyKey: "landing:values.customer.body",
      },
      {
        icon: <LightbulbOutlinedIcon sx={{ fontSize: 28 }} />,
        titleKey: "landing:values.innovation.title",
        bodyKey: "landing:values.innovation.body",
      },
      {
        icon: <SecurityOutlinedIcon sx={{ fontSize: 28 }} />,
        titleKey: "landing:values.trust.title",
        bodyKey: "landing:values.trust.body",
      },
      {
        icon: <HandshakeOutlinedIcon sx={{ fontSize: 28 }} />,
        titleKey: "landing:values.partnership.title",
        bodyKey: "landing:values.partnership.body",
      },
    ],
    []
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: palette.bg,
        color: palette.text,
        fontFamily: fontBody,
      }}
    >
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: `1px solid ${palette.border}`,
          bgcolor: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
        }}
      >
        <Container maxWidth="lg" sx={{ py: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <Typography
            component="span"
            sx={{
              fontFamily: fontDisplay,
              fontWeight: 700,
              fontSize: { xs: "1.05rem", sm: "1.2rem" },
              letterSpacing: "-0.02em",
              flex: 1,
              color: palette.text,
            }}
          >
            {t("landing:navBrand")}
          </Typography>
          <Box>
            <Button
                size="small"
                onClick={() => i18n.changeLanguage("vi")}
                sx={{ 
                    minWidth: 40,
                    fontWeight: i18n.language === 'vi' ? 800 : 400,
                    color: i18n.language === 'vi' ? palette.accent : palette.textMuted 
                }}
            >
                VI
            </Button>
            <Typography component="span" sx={{ color: palette.textMuted }}>|</Typography>
            <Button
                size="small"
                onClick={() => i18n.changeLanguage("en")}
                sx={{ 
                    minWidth: 40,
                    fontWeight: i18n.language === 'en' ? 800 : 400,
                    color: i18n.language === 'en' ? palette.accent : palette.textMuted 
                }}
            >
                EN
            </Button>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ pt: { xs: 6, md: 10 }, pb: 4 }}>
        <Grid container spacing={4} sx={{ alignItems: "center" }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Typography
              variant="overline"
              sx={{
                color: palette.kicker,
                letterSpacing: "0.2em",
                fontWeight: 600,
                display: "block",
                mb: 2,
              }}
            >
              {t("landing:heroKicker")}
            </Typography>
            <Typography
              component="h1"
              sx={{
                fontFamily: fontDisplay,
                fontWeight: 700,
                fontSize: { xs: "2.25rem", sm: "2.75rem", md: "3.25rem" },
                lineHeight: 1.15,
                letterSpacing: "-0.03em",
                mb: 2,
                color: palette.text,
              }}
            >
              {t("landing:heroTitle")}
            </Typography>
            <Typography
              sx={{
                color: palette.textMuted,
                fontSize: { xs: "1rem", md: "1.125rem" },
                lineHeight: 1.7,
                maxWidth: 560,
                mb: 3,
              }}
            >
              {t("landing:heroSubtitle")}
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Button
                variant="contained"
                size="large"
                href="#about"
                sx={{
                  bgcolor: palette.accent,
                  color: "#fff",
                  fontWeight: 700,
                  px: 3,
                  boxShadow: "none",
                  "&:hover": { bgcolor: palette.accentHover, boxShadow: "none" },
                }}
              >
                {t("landing:ctaDiscover")}
              </Button>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Box
              sx={{
                position: "relative",
                borderRadius: 3,
                p: 3,
                bgcolor: palette.bgElevated,
                border: `1px solid ${palette.border}`,
                boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
              }}
            >
              <Typography variant="subtitle2" sx={{ color: palette.accent, mb: 2, fontWeight: 700 }}>
                {t("landing:statsHeading")}
              </Typography>
              <Grid container spacing={2}>
                {[
                  { label: t("landing:statFounded"), value: "2025" },
                  { label: t("landing:statHQ"), value: t("landing:statHQValue") },
                  { label: t("landing:statTeam"), value: t("landing:statTeamValue") },
                  { label: t("landing:statField"), value: t("landing:statFieldShort") },
                ].map((row) => (
                  <Grid size={6} key={row.label}>
                    <Typography variant="h5" sx={{ fontFamily: fontDisplay, fontWeight: 700, color: palette.text }}>
                      {row.value}
                    </Typography>
                    <Typography variant="caption" sx={{ color: palette.textMuted }}>
                      {row.label}
                    </Typography>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Grid>
        </Grid>
      </Container>

      <Box id="about" sx={{ py: sectionSx.py as any, bgcolor: palette.bgMuted }}>
        <Container maxWidth="lg">
          <Typography
            component="h2"
            sx={{
              fontFamily: fontDisplay,
              fontWeight: 700,
              fontSize: { xs: "1.75rem", md: "2.25rem" },
              mb: 2,
              color: palette.text,
            }}
          >
            {t("landing:aboutTitle")}
          </Typography>
          <Typography sx={{ color: palette.textMuted, lineHeight: 1.85, maxWidth: 900, mb: 3 }}>
            {t("landing:aboutBody")}
          </Typography>
          <Typography sx={{ color: palette.textMuted, lineHeight: 1.85, maxWidth: 900 }}>
            {t("landing:aboutBody2")}
          </Typography>
        </Container>
      </Box>

      <Box sx={{ py: sectionSx.py as any, bgcolor: palette.bg }}>
        <Container maxWidth="lg">
          <Typography
            component="h2"
            sx={{
              fontFamily: fontDisplay,
              fontWeight: 700,
              fontSize: { xs: "1.75rem", md: "2.25rem" },
              mb: 3,
              color: palette.text,
            }}
          >
            {t("landing:productsTitle")}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 5 }}>
            {productItems.map((label) => (
              <Chip
                key={label}
                label={label}
                sx={{
                  bgcolor: "#f3f4f6",
                  color: palette.text,
                  border: `1px solid ${palette.border}`,
                  py: 2.5,
                  px: 0.5,
                  fontSize: "0.9rem",
                  "& .MuiChip-label": { whiteSpace: "normal", textAlign: "left" },
                }}
              />
            ))}
          </Box>

          <Box id="products-showcase" sx={{ textAlign: "center", maxWidth: 900, mx: "auto", mb: 3 }}>
            <Typography
              component="h3"
              sx={{
                fontFamily: fontDisplay,
                fontWeight: 700,
                fontSize: { xs: "1.5rem", md: "1.85rem" },
                mb: 2,
                color: palette.text,
              }}
            >
              {t("landing:productsShowcaseTitle")}
            </Typography>
            <Typography
              sx={{
                color: palette.textMuted,
                lineHeight: 1.8,
                fontSize: { xs: "0.95rem", md: "1.05rem" },
              }}
            >
              {t("landing:productsShowcaseIntro")}
            </Typography>
          </Box>

          <LandingProductSlider images={HUNGVIET_SMARTHOME_GALLERY_IMAGES} />
        </Container>
      </Box>

      <Box component="main">
        <Container maxWidth="lg" sx={{ py: sectionSx.py as any }}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography
                component="h2"
                sx={{
                  fontFamily: fontDisplay,
                  fontWeight: 700,
                  fontSize: "1.35rem",
                  color: palette.accent,
                  mb: 1.5,
                }}
              >
                {t("landing:visionTitle")}
              </Typography>
              <Typography sx={{ color: palette.textMuted, lineHeight: 1.8 }}>{t("landing:visionBody")}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography
                component="h2"
                sx={{
                  fontFamily: fontDisplay,
                  fontWeight: 700,
                  fontSize: "1.35rem",
                  color: palette.accent,
                  mb: 1.5,
                }}
              >
                {t("landing:missionTitle")}
              </Typography>
              <Stack component="ul" spacing={1.5} sx={{ m: 0, pl: 2.5, color: palette.textMuted, lineHeight: 1.7 }}>
                <Typography component="li" variant="body2">
                  {t("landing:mission1")}
                </Typography>
                <Typography component="li" variant="body2">
                  {t("landing:mission2")}
                </Typography>
                <Typography component="li" variant="body2">
                  {t("landing:mission3")}
                </Typography>
                <Typography component="li" variant="body2">
                  {t("landing:mission4")}
                </Typography>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography
                component="h2"
                sx={{
                  fontFamily: fontDisplay,
                  fontWeight: 700,
                  fontSize: "1.35rem",
                  color: palette.accent,
                  mb: 1.5,
                }}
              >
                {t("landing:directionsTitle")}
              </Typography>
              <Typography sx={{ color: palette.textMuted, lineHeight: 1.8 }}>{t("landing:directionsBody")}</Typography>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box sx={{ py: sectionSx.py as any, bgcolor: palette.bg }}>
        <Container maxWidth="lg">
          <Typography
            component="h2"
            sx={{
              fontFamily: fontDisplay,
              fontWeight: 700,
              fontSize: { xs: "1.75rem", md: "2.25rem" },
              mb: 5,
              color: palette.text,
            }}
          >
            {t("landing:valuesTitle")}
          </Typography>
          <Grid container spacing={4} sx={{ alignItems: "stretch" }}>
            {valueItems.map((item) => (
              <Grid
                size={{ xs: 12, sm: 6, md: 4 }}
                key={item.titleKey}
                sx={{ display: "flex", minWidth: 0 }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    minWidth: 0,
                    p: 4,
                    borderRadius: 3,
                    bgcolor: palette.bgElevated,
                    border: `1px solid ${palette.border}`,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                    transition: "box-shadow 0.3s ease, border-color 0.3s ease, transform 0.3s ease",
                    "&:hover": {
                      transform: "translateY(-4px)",
                      boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
                      borderColor: palette.accentSoft,
                    },
                  }}
                >
                  <Box sx={{ color: palette.accent, mb: 2.5, display: 'flex' }}>
                    {item.icon}
                  </Box>
                  <Typography 
                    variant="h6"
                    sx={{ 
                      fontWeight: 700, 
                      mb: 1.5, 
                      fontFamily: fontDisplay, 
                      color: palette.text,
                      fontSize: '1.25rem'
                    }}
                  >
                    {t(item.titleKey)}
                  </Typography>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      color: palette.textMuted, 
                      lineHeight: 1.7,
                      fontSize: '0.95rem'
                    }}
                  >
                    {t(item.bodyKey)}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box
        component="footer"
        sx={{
          borderTop: `1px solid ${palette.border}`,
          py: 5,
          bgcolor: palette.bgMuted,
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            <Grid size={6}>
              <Typography sx={{ fontFamily: fontDisplay, fontWeight: 700, mb: 2, color: palette.text }}>
                {t("landing:footerCompany")}
              </Typography>
              <Typography variant="body2" sx={{ color: palette.textMuted, lineHeight: 1.8 }}>
                {t("landing:footerAddress")}
                <br />
                {t("landing:footerTax")}
                <br />
                {t("landing:footerPhone")}
                <br />
                {t("landing:footerEmail")}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ textAlign: { xs: "left", md: "right" } }}>
              <Typography variant="body2" sx={{ color: palette.textMuted, mb: 2 }}>
                {t("landing:footerNote")}
              </Typography>
              <Button
                component="a"
                href="https://www.hungvietsmarthome.com/"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: palette.accent, fontWeight: 600 }}
              >
                hungvietsmarthome.com →
              </Button>
              <Box sx={{ mt: 2 }}>
                <Button
                  size="small"
                  onClick={() => i18n.changeLanguage("vi")}
                  sx={{ 
                      minWidth: 40,
                      fontWeight: i18n.language === 'vi' ? 800 : 400,
                      color: i18n.language === 'vi' ? palette.accent : palette.textMuted 
                }}
                >
                  VI
                </Button>
                <Typography component="span" sx={{ color: palette.textMuted, mx: 1 }}>
                  |
                </Typography>
                <Button
                  size="small"
                  onClick={() => i18n.changeLanguage("en")}
                  sx={{ 
                      minWidth: 40,
                      fontWeight: i18n.language === 'en' ? 800 : 400,
                      color: i18n.language === 'en' ? palette.accent : palette.textMuted 
                  }}
                >
                  EN
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
};

const CompanyLandingPage = memo(CompanyLandingPageComponent);
export default CompanyLandingPage;

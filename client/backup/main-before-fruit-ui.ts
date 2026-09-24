import Phaser from "phaser";
import { gsap } from "gsap";

const COLS = 8;
const ROWS = 8;
const TYPES = 6;

type PieceType = 0 | 1 | 2 | 3 | 4 | 5;

type Piece = {
  type: PieceType;
  container: Phaser.GameObjects.Container;
  special?: "line-h" | "line-v" | "bomb" | "rainbow";
};

type Layout = {
  width: number;
  height: number;
  portrait: boolean;
  cell: number;
  boardSize: number;
  boardX: number;
  boardY: number;
  hudTop: number;
  titleSize: number;
  subtitleSize: number;
  statSize: number;
  smallSize: number;
};

type LevelConfig = {
  target: number;
  time: number;
  moves: number;
  objective: "score" | "crystals" | "combo" | "specials";
  objectiveAmount: number;
  name: string;
};

const LEVELS: LevelConfig[] = [
  { target: 5000, time: 180, moves: 45, objective: "score", objectiveAmount: 5000, name: "AWAKENING" },
  { target: 8500, time: 195, moves: 50, objective: "crystals", objectiveAmount: 90, name: "DEEP MAZE" },
  { target: 12500, time: 210, moves: 55, objective: "combo", objectiveAmount: 6, name: "CRYSTAL STORM" },
  { target: 17000, time: 225, moves: 60, objective: "specials", objectiveAmount: 6, name: "THE CORE" },
  { target: 23000, time: 240, moves: 65, objective: "score", objectiveAmount: 23000, name: "MAZE MASTER" },
];

const CANDIES: Array<{
  color: number;
  dark: number;
  glow: number;
  symbol: string;
}> = [
  { color: 0x43d98b, dark: 0x167a53, glow: 0x8fffc2, symbol: "â—†" },
  { color: 0xff4f73, dark: 0x9c2347, glow: 0xffa1b6, symbol: "â—‡" },
  { color: 0xffc936, dark: 0x9b6b08, glow: 0xffee8a, symbol: "â˜…" },
  { color: 0x5ba8ff, dark: 0x1c579c, glow: 0x9bd0ff, symbol: "â—" },
  { color: 0xa66cff, dark: 0x57339c, glow: 0xd2b5ff, symbol: "â—" },
  { color: 0xff7b38, dark: 0x9c4217, glow: 0xffbd91, symbol: "â˜…" },
];

class MazeHunter extends Phaser.Scene {
  private board: Array<Array<PieceType | null>> = [];
  private pieces: Array<Array<Piece | null>> = [];

  private selected: { row: number; col: number } | null = null;
  private busy = false;

  private score = 0;
  private moves = 45;
  private combo = 0;

  private level = 1;
  private lives = 3;
  private timeLeft = 180;
  private power = 0;
  private specialsCreated = 0;
  private levelCompletePending = false;
  private gameStarted = false;
  private timerEvent?: Phaser.Time.TimerEvent;

  private layout!: Layout;

  private boardFrame!: Phaser.GameObjects.Graphics;
  private background!: Phaser.GameObjects.Graphics;
  private backgroundImage?: Phaser.GameObjects.Image;
  private backgroundFx?: Phaser.GameObjects.Container;
  private hudFrame!: Phaser.GameObjects.Graphics;
  private progressBar!: Phaser.GameObjects.Graphics;

  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;

  private scoreLabel!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;

  private movesLabel!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;

  private objectiveText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private powerBar!: Phaser.GameObjects.Graphics;
  private starsText!: Phaser.GameObjects.Text;
  private levelBadgeText!: Phaser.GameObjects.Text;
  private objectiveBadgeText!: Phaser.GameObjects.Text;

  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartRow = -1;
  private touchStartCol = -1;

  private hintTimer?: Phaser.Time.TimerEvent;
  private hintObjects: Phaser.GameObjects.GameObject[] = [];
  private hintActive = false;
  private bestCombo = 0;

  private resizeHandler?: () => void;

  private audioContext?: AudioContext;
  private soundReady = false;
  private totalCleared = 0;
  private movesMade = 0;
  private comboBuddy?: Phaser.GameObjects.Container;

  constructor() {
    super("MazeHunter");
  }

  preload() {
    this.load.image("level-bg-1", "/assets/backgrounds/level-1.jpg");
    this.load.image("level-bg-2", "/assets/backgrounds/level-2.jpg");
    this.load.image("level-bg-3", "/assets/backgrounds/level-3.jpg");
    this.load.image("level-bg-4", "/assets/backgrounds/level-4.jpg");
    this.load.image("level-bg-5", "/assets/backgrounds/level-5.jpg");
  }

  create() {
    this.input.addPointer(3);
    this.input.setDefaultCursor("pointer");

    this.layout = this.calculateLayout();

    this.createBackground();
    this.createHud();

    this.generateBoard();

    this.resizeHandler = () => this.relayout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeHandler);

    this.relayout();
    this.setupInput();
    this.updateHud();
    this.showIntroScreen();
  }

  shutdown() {
    if (this.resizeHandler) {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeHandler);
    }
    if (this.timerEvent) {
      this.timerEvent.remove(false);
    }
    if (this.backgroundFx) {
      this.backgroundFx.list.forEach((child) => gsap.killTweensOf(child));
    }
  }

  private calculateLayout(): Layout {
    const width = Math.max(320, this.scale.width);
    const height = Math.max(520, this.scale.height);
    const portrait = height >= width;

    let cell: number;

    if (portrait) {
      const availableWidth = width - 24;
      const availableHeight = height * 0.59;
      cell = Math.floor(Math.min(availableWidth, availableHeight) / COLS);
    } else {
      const availableWidth = width * 0.62;
      const availableHeight = height * 0.69;
      cell = Math.floor(Math.min(availableWidth, availableHeight) / COLS);
    }

    cell = Phaser.Math.Clamp(cell, 34, 86);

    const boardSize = cell * COLS;

    let boardX: number;
    let boardY: number;

    if (portrait) {
      boardX = (width - boardSize) / 2;
      boardY = Math.min(
        height - boardSize - 22,
        Math.max(156, height * 0.285)
      );
    } else {
      boardX = width * 0.57 - boardSize / 2;
      boardY = Math.max(120, (height - boardSize) / 2 + 22);
    }

    const titleSize = Phaser.Math.Clamp(width * 0.052, 24, 46);
    const subtitleSize = Phaser.Math.Clamp(width * 0.022, 11, 18);
    const statSize = Phaser.Math.Clamp(width * 0.048, 22, 38);
    const smallSize = Phaser.Math.Clamp(width * 0.018, 10, 15);

    return {
      width,
      height,
      portrait,
      cell,
      boardSize,
      boardX,
      boardY,
      hudTop: portrait ? 22 : 26,
      titleSize,
      subtitleSize,
      statSize,
      smallSize,
    };
  }

  private createBackground() {
    this.backgroundImage = this.add.image(0, 0, "level-bg-1")
      .setOrigin(0.5)
      .setDepth(-110)
      .setAlpha(0.92);

    this.background = this.add.graphics();
    this.background.setDepth(-100);

    this.backgroundFx = this.add.container(0, 0);
    this.backgroundFx.setDepth(-90);
  }

  private layoutBackgroundImage() {
    if (!this.backgroundImage) return;

    const { width, height } = this.layout;
    const texture = this.backgroundImage.texture;
    const source = texture.getSourceImage() as HTMLImageElement;
    const imageWidth = Math.max(1, Number(source.width) || 1);
    const imageHeight = Math.max(1, Number(source.height) || 1);

    const scale = Math.max(width / imageWidth, height / imageHeight);
    this.backgroundImage.setPosition(width / 2, height / 2);
    this.backgroundImage.setDisplaySize(imageWidth * scale, imageHeight * scale);
  }

  private updateLevelBackground(animate = false) {
    if (!this.backgroundImage) return;

    const key = `level-bg-${Math.min(this.level, 5)}`;
    const previousAlpha = this.backgroundImage.alpha;

    this.backgroundImage.setTexture(key);
    this.layoutBackgroundImage();

    if (animate) {
      this.backgroundImage.setAlpha(0.35);
      gsap.to(this.backgroundImage, {
        alpha: previousAlpha || 0.92,
        duration: 0.8,
        ease: "power2.out",
      });
    } else {
      this.backgroundImage.setAlpha(0.92);
    }
  }

  private drawBackground() {
    const { width, height } = this.layout;

    this.updateLevelBackground(false);
    this.layoutBackgroundImage();

    if (this.backgroundFx) {
      this.backgroundFx.list.forEach((child) => gsap.killTweensOf(child));
      this.backgroundFx.destroy();
    }

    this.backgroundFx = this.add.container(0, 0);
    this.backgroundFx.setDepth(-90);

    // Subtle world motion: the illustrated maze breathes instead of sitting still.
    if (this.backgroundImage) {
      gsap.killTweensOf(this.backgroundImage);
      const baseX = width / 2;
      const baseY = height / 2;
      gsap.to(this.backgroundImage, {
        x: baseX + 4,
        y: baseY - 3,
        duration: 7.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }

    const mazeMotion = this.add.graphics();
    mazeMotion.lineStyle(2, 0x7ce9dc, 0.055);
    mazeMotion.strokeCircle(width * 0.5, height * 0.5, Math.min(width, height) * 0.31);
    mazeMotion.lineStyle(1.5, 0xffd86a, 0.045);
    mazeMotion.strokeCircle(width * 0.5, height * 0.5, Math.min(width, height) * 0.22);
    mazeMotion.setAlpha(0.75);
    this.backgroundFx.add(mazeMotion);

    gsap.to(mazeMotion, {
      angle: 360,
      alpha: 0.48,
      duration: 28,
      repeat: -1,
      ease: "none",
    });
    gsap.to(mazeMotion, {
      scale: 1.035,
      duration: 9,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });

    this.background.clear();

    // MAZE HUNTER V5: cinematic obsidian / crystal-lab environment.
    // Readability veil over the illustrated world so gameplay UI remains crisp.
    this.background.fillStyle(0x35183f, 0.10);
    this.background.fillRect(0, 0, width, height);

    // Layered atmospheric fields.
    this.background.fillStyle(0x07111d, 0.16);
    this.background.fillCircle(width * 0.12, height * 0.20, Math.min(width, height) * 0.42);

    this.background.fillStyle(0x1b1030, 0.12);
    this.background.fillCircle(width * 0.88, height * 0.72, Math.min(width, height) * 0.48);

    this.background.fillStyle(0x082c31, 0.10);
    this.background.fillCircle(width * 0.50, height * 0.55, Math.min(width, height) * 0.56);

    // Diagonal tactical bands.
    this.background.lineStyle(1, 0x58e5d0, 0.055);
    for (let i = -height; i < width + height; i += Math.max(72, this.layout.cell * 1.7)) {
      this.background.lineBetween(i, 0, i - height, height);
    }

    // Fine hex-style technical grid.
    const grid = Math.max(42, this.layout.cell * 1.15);
    this.background.lineStyle(1, 0x6be9e0, 0.045);
    for (let x = -grid; x <= width + grid; x += grid) {
      this.background.lineBetween(x, 0, x, height);
    }
    for (let y = -grid; y <= height + grid; y += grid) {
      this.background.lineBetween(0, y, width, y);
    }

    // Central maze-ring geometry.
    const cx = width * 0.5;
    const cy = height * 0.50;
    const ring = Math.min(width, height) * 0.34;
    this.background.lineStyle(2, 0x37cfc4, 0.075);
    this.background.strokeCircle(cx, cy, ring);
    this.background.strokeCircle(cx, cy, ring * 0.76);
    this.background.strokeCircle(cx, cy, ring * 0.51);

    // Corner framing.
    this.background.lineStyle(2, 0x58e5d0, 0.13);
    const inset = 14;
    const len = Math.min(72, Math.max(34, this.layout.cell * 0.9));
    this.background.lineBetween(inset, inset, inset + len, inset);
    this.background.lineBetween(inset, inset, inset, inset + len);
    this.background.lineBetween(width - inset - len, inset, width - inset, inset);
    this.background.lineBetween(width - inset, inset, width - inset, inset + len);
    this.background.lineBetween(inset, height - inset, inset + len, height - inset);
    this.background.lineBetween(inset, height - inset - len, inset, height - inset);
    this.background.lineBetween(width - inset - len, height - inset, width - inset, height - inset);
    this.background.lineBetween(width - inset, height - inset - len, width - inset, height - inset);

    // Animated crystal dust.
    const colors = [0x5be8d7, 0x8f7cff, 0xffd65a, 0x65a9ff];
    const count = Math.min(34, Math.max(18, Math.floor(width / 22)));

    for (let i = 0; i < count; i++) {
      const x = Phaser.Math.Between(12, Math.max(13, width - 12));
      const y = Phaser.Math.Between(12, Math.max(13, height - 12));
      const size = Phaser.Math.FloatBetween(1.2, 3.2);
      const dot = this.add.circle(x, y, size, colors[i % colors.length], Phaser.Math.FloatBetween(0.12, 0.42));
      this.backgroundFx.add(dot);

      gsap.to(dot, {
        y: y - Phaser.Math.Between(8, 28),
        alpha: Phaser.Math.FloatBetween(0.18, 0.65),
        duration: Phaser.Math.FloatBetween(1.8, 3.6),
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        delay: i * 0.045,
      });
    }

    // A few slow-moving energy motes.
    for (let i = 0; i < 5; i++) {
      const mote = this.add.circle(
        width * (0.12 + i * 0.19),
        height * (0.18 + (i % 3) * 0.26),
        3,
        colors[(i + 1) % colors.length],
        0.16
      );
      this.backgroundFx.add(mote);

      gsap.to(mote, {
        x: mote.x + (i % 2 === 0 ? 80 : -80),
        y: mote.y + (i % 2 === 0 ? -45 : 55),
        alpha: 0.02,
        duration: 5 + i * 0.7,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        delay: i * 0.35,
      });
    }

    // Edge vignette.
    this.background.fillStyle(0x000000, 0.24);
    this.background.fillRect(0, 0, width, 10);
    this.background.fillRect(0, height - 10, width, 10);
    this.background.fillRect(0, 0, 10, height);
    this.background.fillRect(width - 10, 0, 10, height);
  }

  private createHud() {
    this.hudFrame = this.add.graphics().setDepth(1);
    this.progressBar = this.add.graphics().setDepth(2);

    const textBase = {
      fontFamily: "Trebuchet MS, Arial, sans-serif",
      fontStyle: "bold" as const,
    };

    this.titleText = this.add.text(0, 0, "MAZE HUNTER", {
      ...textBase,
      fontSize: "34px",
      color: "#ffffff",
      stroke: "#8d3f8c",
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 3, color: "#6d2d72", blur: 7, stroke: true, fill: true },
    }).setOrigin(0.5);

    this.subtitleText = this.add.text(0, 0, "CRYSTAL MAZE", {
      ...textBase,
      fontSize: "12px",
      color: "#8a4f88",
      letterSpacing: 3,
    }).setOrigin(0.5);

    this.scoreLabel = this.add.text(0, 0, "SCORE", {
      ...textBase, fontSize: "10px", color: "#9b668f", letterSpacing: 2,
    }).setOrigin(0.5);
    this.scoreText = this.add.text(0, 0, "000000", {
      ...textBase, fontSize: "24px", color: "#5f315f",
    }).setOrigin(0.5);

    this.movesLabel = this.add.text(0, 0, "MOVES", {
      ...textBase, fontSize: "10px", color: "#9b668f", letterSpacing: 2,
    }).setOrigin(0.5);
    this.movesText = this.add.text(0, 0, "45", {
      ...textBase, fontSize: "24px", color: "#5f315f",
    }).setOrigin(0.5);

    this.objectiveText = this.add.text(0, 0, "REACH 5,000", {
      ...textBase, fontSize: "11px", color: "#7a3d78", letterSpacing: 1.2,
    }).setOrigin(0.5);

    this.comboText = this.add.text(0, 0, "", {
      ...textBase, fontSize: "25px", color: "#ff4f91",
      stroke: "#ffffff", strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0);

    this.levelText = this.add.text(0, 0, "LEVEL 01 â€¢ AWAKENING", {
      ...textBase, fontSize: "10px", color: "#8b4f87", letterSpacing: 1.8,
    }).setOrigin(0.5);

    this.timerText = this.add.text(0, 0, "03:00", {
      ...textBase, fontSize: "16px", color: "#7a3d78",
    }).setOrigin(0.5);

    this.livesText = this.add.text(0, 0, "â™¥ â™¥ â™¥", {
      ...textBase, fontSize: "14px", color: "#ef5681",
    }).setOrigin(0.5);

    this.starsText = this.add.text(0, 0, "â˜… â˜… â˜…", {
      ...textBase, fontSize: "17px", color: "#ffd45a",
      stroke: "#a85b87", strokeThickness: 2,
    }).setOrigin(0.5);

    this.levelBadgeText = this.add.text(0, 0, "1", {
      ...textBase, fontSize: "21px", color: "#9a3f75",
      stroke: "#ffffff", strokeThickness: 4,
    }).setOrigin(0.5);

    this.objectiveBadgeText = this.add.text(0, 0, "5,000", {
      ...textBase, fontSize: "14px", color: "#7a3d78",
    }).setOrigin(0.5);

    this.powerBar = this.add.graphics().setDepth(102);
    this.createComboBuddy();
  }

  private createComboBuddy() {
    const buddy = this.add.container(0, 0).setDepth(60).setAlpha(0);
    const body = this.add.circle(0, 0, 17, 0xff72ad, 1);
    body.setStrokeStyle(3, 0xffffff, 0.95);
    const shine = this.add.circle(-6, -6, 4, 0xffffff, 0.65);
    const eye1 = this.add.circle(-5, -1, 2.2, 0x4c214e, 1);
    const eye2 = this.add.circle(5, -1, 2.2, 0x4c214e, 1);
    const smile = this.add.arc(0, 4, 6, 20, 160, false, 0x4c214e, 1);
    buddy.add([body, shine, eye1, eye2, smile]);
    this.comboBuddy = buddy;

    gsap.to(buddy, {
      y: "+=4",
      angle: 4,
      duration: 1.15,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  }

  private relayout() {
    this.layout = this.calculateLayout();

    this.drawBackground();
    this.layoutHud();
    this.layoutBoard();
  }

  private layoutHud() {
    const { width, portrait, titleSize, subtitleSize, statSize } = this.layout;

    this.hudFrame.clear();
    this.progressBar.clear();

    // Candy Crush-inspired gameplay HUD: one compact candy-glass ribbon.
    const headerH = portrait ? 104 : 84;
    const x = portrait ? 8 : 14;
    const w = width - x * 2;
    const y = portrait ? 8 : 12;

    // Soft shadow.
    this.hudFrame.fillStyle(0x6b2b65, 0.28);
    this.hudFrame.fillRoundedRect(x + 2, y + 6, w, headerH, 25);

    // Pink candy ribbon.
    this.hudFrame.fillStyle(0xff75b8, 0.96);
    this.hudFrame.fillRoundedRect(x, y, w, headerH, 25);
    this.hudFrame.lineStyle(3, 0xffd8ec, 0.98);
    this.hudFrame.strokeRoundedRect(x, y, w, headerH, 25);
    this.hudFrame.lineStyle(2, 0xd83f91, 0.55);
    this.hudFrame.strokeRoundedRect(x + 5, y + 5, w - 10, headerH - 10, 20);

    // Gloss strip.
    this.hudFrame.fillStyle(0xffffff, 0.18);
    this.hudFrame.fillRoundedRect(x + 9, y + 8, w - 18, Math.max(10, headerH * 0.22), 8);

    if (portrait) {
      // Left score plaque.
      const scoreX = x + Math.min(112, width * 0.17);
      this.hudFrame.fillStyle(0xffc5df, 0.42);
      this.hudFrame.fillRoundedRect(x + 10, y + 14, Math.min(118, width * 0.28), 58, 18);
      this.hudFrame.fillStyle(0xffffff, 0.24);
      this.hudFrame.fillRoundedRect(x + 13, y + 17, Math.min(112, width * 0.265), 18, 9);

      this.scoreLabel.setText("SCORE").setPosition(scoreX - 35, y + 29).setOrigin(0.5).setFontSize(8).setColor("#8c3c72");
      this.scoreText.setPosition(scoreX - 35, y + 52).setOrigin(0.5).setFontSize(Math.max(18, statSize * 0.72)).setColor("#ffffff");
      this.scoreText.setShadow(0, 2, "#9c3f78", 3, true, true);

      // Stars + level medallion.
      const centerX = width / 2;
      this.starsText.setPosition(centerX, y + 22).setFontSize(Math.max(14, width * 0.034));
      this.levelBadgeText.setPosition(centerX, y + 54).setFontSize(Math.max(20, width * 0.048));
      this.hudFrame.fillStyle(0xffe9f5, 0.98);
      this.hudFrame.fillCircle(centerX, y + 53, 23);
      this.hudFrame.lineStyle(2, 0xffb1d4, 0.95);
      this.hudFrame.strokeCircle(centerX, y + 53, 23);

      // Objective capsule on the right.
      const objectiveW = Math.min(138, width * 0.30);
      const objectiveX = x + w - objectiveW - 10;
      this.hudFrame.fillStyle(0xffc5df, 0.42);
      this.hudFrame.fillRoundedRect(objectiveX, y + 14, objectiveW, 58, 18);
      this.hudFrame.fillStyle(0xffffff, 0.24);
      this.hudFrame.fillRoundedRect(objectiveX + 4, y + 17, objectiveW - 8, 18, 9);
      this.objectiveText.setPosition(objectiveX + objectiveW / 2, y + 29).setFontSize(8).setColor("#8c3c72");
      this.objectiveBadgeText.setPosition(objectiveX + objectiveW / 2, y + 51).setFontSize(14).setColor("#ffffff");

      this.timerText.setPosition(x + 55, y + 89).setFontSize(14).setColor("#ffffff");
      this.timerText.setShadow(0, 2, "#9c3f78", 3, true, true);
      this.livesText.setPosition(x + w - 48, y + 89).setFontSize(12).setColor("#fff7fc");

      this.levelText.setPosition(width / 2, y + headerH + 13).setFontSize(9).setColor("#7b416f");
      this.titleText.setPosition(width / 2, y + headerH + 29).setFontSize(Math.min(titleSize * 0.55, 23)).setColor("#fff8fd").setAlpha(0.96);
      this.subtitleText.setPosition(width / 2, y + headerH + 47).setFontSize(Math.max(8, subtitleSize * 0.62)).setColor("#ffd7ec");

      this.drawProgressBar(width / 2 - Math.min(105, width * 0.25), y + headerH + 56, Math.min(210, width * 0.5), 7);
    } else {
      const center = width / 2;
      this.scoreLabel.setPosition(x + 72, y + 27).setFontSize(8).setColor("#8c3c72");
      this.scoreText.setPosition(x + 72, y + 54).setFontSize(Math.max(18, statSize * 0.72)).setColor("#ffffff");
      this.starsText.setPosition(center - 18, y + 22).setFontSize(14);
      this.levelBadgeText.setPosition(center, y + 53).setFontSize(19);
      this.hudFrame.fillStyle(0xffe9f5, 0.98);
      this.hudFrame.fillCircle(center, y + 53, 22);
      this.objectiveText.setPosition(x + w - 95, y + 27).setFontSize(8).setColor("#8c3c72");
      this.objectiveBadgeText.setPosition(x + w - 95, y + 53).setFontSize(13).setColor("#ffffff");
      this.timerText.setPosition(center + 48, y + 23).setFontSize(13).setColor("#fff");
      this.livesText.setPosition(center + 48, y + 52).setFontSize(11).setColor("#fff");
      this.levelText.setPosition(center, y + headerH + 10).setFontSize(9).setColor("#7b416f");
      this.titleText.setPosition(center, y + headerH + 25).setFontSize(22);
      this.subtitleText.setPosition(center, y + headerH + 41).setFontSize(9);
      this.drawProgressBar(center - 120, y + headerH + 49, 240, 7);
    }

    this.drawPowerBar();

    // Dedicated combo announcement zone. It never sits on top of candies.
    this.comboText.setPosition(
      width / 2,
      Math.max(y + headerH + 74, this.layout.boardY - Math.max(18, this.layout.cell * 0.28))
    );
    this.comboText.setDepth(95);

    this.hudFrame.setDepth(100);
    this.progressBar.setDepth(101);
    this.titleText.setDepth(105);
    this.subtitleText.setDepth(105);
    this.scoreLabel.setDepth(110);
    this.scoreText.setDepth(110);
    this.movesLabel.setDepth(110);
    this.movesText.setDepth(110);
    this.objectiveText.setDepth(110);
    this.objectiveBadgeText.setDepth(110);
    this.levelText.setDepth(110);
    this.levelBadgeText.setDepth(110);
    this.starsText.setDepth(110);
    this.timerText.setDepth(110);
    this.livesText.setDepth(110);
  }

  private drawProgressBar(x: number, y: number, w: number, h: number) {
    const progress = this.getObjectiveProgress();

    this.progressBar.fillStyle(0xeadbe9, 0.90);
    this.progressBar.fillRoundedRect(x, y, w, h, h / 2);

    this.progressBar.lineStyle(1, 0xffffff, 0.75);
    this.progressBar.strokeRoundedRect(x, y, w, h, h / 2);

    const fill = progress >= 1 ? 0xffc93f : 0xff6fae;
    const fillW = Math.max(4, (w - 4) * progress);

    this.progressBar.fillStyle(fill, 0.96);
    this.progressBar.fillRoundedRect(x + 2, y + 2, fillW, h - 4, (h - 4) / 2);

    if (fillW > 12) {
      this.progressBar.fillStyle(0xffffff, 0.25);
      this.progressBar.fillRoundedRect(x + 4, y + 3, Math.max(4, fillW - 8), 2, 1);
    }
  }

  private getLevelConfig(): LevelConfig {
    return LEVELS[Math.min(this.level - 1, LEVELS.length - 1)];
  }

  private getObjectiveProgress(): number {
    const config = this.getLevelConfig();
    if (config.objective === "score") {
      return Phaser.Math.Clamp(this.score / config.objectiveAmount, 0, 1);
    }
    if (config.objective === "crystals") {
      return Phaser.Math.Clamp(this.totalCleared / config.objectiveAmount, 0, 1);
    }
    if (config.objective === "combo") {
      return Phaser.Math.Clamp(this.bestCombo / config.objectiveAmount, 0, 1);
    }
    return Phaser.Math.Clamp(this.specialsCreated / config.objectiveAmount, 0, 1);
  }

  private getObjectiveLabel(): string {
    const config = this.getLevelConfig();
    if (config.objective === "score") return `MISSION â€¢ REACH ${config.objectiveAmount.toLocaleString()}`;
    if (config.objective === "crystals") return `MISSION â€¢ CLEAR ${config.objectiveAmount} CRYSTALS`;
    if (config.objective === "combo") return `MISSION â€¢ REACH COMBO Ã—${config.objectiveAmount}`;
    return `MISSION â€¢ CREATE ${config.objectiveAmount} SPECIALS`;
  }

  private isObjectiveComplete(): boolean {
    return this.getObjectiveProgress() >= 1;
  }

  private formatTime(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
  }

  private drawPowerBar() {
    if (!this.powerBar) return;

    const { width, height, portrait } = this.layout;
    const w = Math.min(width * (portrait ? 0.46 : 0.30), 260);
    const x = width / 2 - w / 2;
    const y = portrait ? height - 72 : height - 62;

    this.powerBar.clear();

    this.powerBar.fillStyle(0xfff4fb, 0.92);
    this.powerBar.fillRoundedRect(x, y, w, 9, 5);

    this.powerBar.lineStyle(1, 0xff9ec9, 0.55);
    this.powerBar.strokeRoundedRect(x, y, w, 9, 5);

    const progress = Phaser.Math.Clamp(this.power / 100, 0, 1);
    const fill = this.power >= 100 ? 0xffc83d : 0xff72ad;

    this.powerBar.fillStyle(fill, 0.95);
    this.powerBar.fillRoundedRect(x + 2, y + 2, Math.max(3, (w - 4) * progress), 5, 3);

    if (progress > 0.02) {
      this.powerBar.fillStyle(0xffffff, 0.28);
      this.powerBar.fillRoundedRect(x + 4, y + 3, Math.max(2, (w - 8) * progress), 1.5, 1);
    }

  }

  private layoutBoard() {
    if (!this.boardFrame) {
      this.boardFrame = this.add.graphics();
    }

    const { boardX, boardY, boardSize, cell } = this.layout;
    this.boardFrame.clear();

    const outer = Math.max(16, cell * 0.22);
    const radius = Math.max(22, cell * 0.30);

    // Soft candy shadow.
    this.boardFrame.fillStyle(0x6a3970, 0.26);
    this.boardFrame.fillRoundedRect(
      boardX - outer + 7,
      boardY - outer + 12,
      boardSize + outer * 2,
      boardSize + outer * 2,
      radius + 8
    );

    // Cream candy-board chassis.
    this.boardFrame.fillStyle(0xfff7fc, 0.93);
    this.boardFrame.fillRoundedRect(
      boardX - outer,
      boardY - outer,
      boardSize + outer * 2,
      boardSize + outer * 2,
      radius
    );

    this.boardFrame.lineStyle(3, 0xffffff, 0.95);
    this.boardFrame.strokeRoundedRect(
      boardX - outer,
      boardY - outer,
      boardSize + outer * 2,
      boardSize + outer * 2,
      radius
    );

    this.boardFrame.lineStyle(3, 0xe99bcf, 0.72);
    this.boardFrame.strokeRoundedRect(
      boardX - outer + 5,
      boardY - outer + 5,
      boardSize + outer * 2 - 10,
      boardSize + outer * 2 - 10,
      radius - 5
    );

    // Pastel inner rim.
    this.boardFrame.fillStyle(0xdff6ff, 0.48);
    this.boardFrame.fillRoundedRect(
      boardX - 4,
      boardY - 4,
      boardSize + 8,
      boardSize + 8,
      Math.max(14, cell * 0.18)
    );

    // Soft playing chamber, designed to let the illustrated world remain visible around it.
    this.boardFrame.fillStyle(0xfffaff, 0.78);
    this.boardFrame.fillRoundedRect(
      boardX,
      boardY,
      boardSize,
      boardSize,
      Math.max(12, cell * 0.13)
    );

    // Candy-colored grid.
    this.boardFrame.lineStyle(1, 0xb97ac2, 0.13);
    for (let r = 1; r < ROWS; r++) {
      const y = boardY + r * cell;
      this.boardFrame.lineBetween(boardX + 2, y, boardX + boardSize - 2, y);
    }
    for (let c = 1; c < COLS; c++) {
      const x = boardX + c * cell;
      this.boardFrame.lineBetween(x, boardY + 2, x, boardY + boardSize - 2);
    }

    // Tiny pastel maze accents behind the pieces.
    this.boardFrame.lineStyle(1, 0x86cfe4, 0.12);
    for (let i = 0; i < 4; i++) {
      const inset = cell * (0.35 + i * 0.38);
      this.boardFrame.lineBetween(boardX + inset, boardY + 3, boardX + boardSize - 3, boardY + inset);
    }

    // Candy-cane corner brackets.
    this.boardFrame.lineStyle(3, 0xff79b5, 0.9);
    const b = Math.max(13, cell * 0.22);
    const left = boardX - outer + 9;
    const right = boardX + boardSize + outer - 9;
    const top = boardY - outer + 9;
    const bottom = boardY + boardSize + outer - 9;

    this.boardFrame.lineBetween(left, top + b, left, top);
    this.boardFrame.lineBetween(left, top, left + b, top);
    this.boardFrame.lineBetween(right - b, top, right, top);
    this.boardFrame.lineBetween(right, top, right, top + b);
    this.boardFrame.lineBetween(left, bottom - b, left, bottom);
    this.boardFrame.lineBetween(left, bottom, left + b, bottom);
    this.boardFrame.lineBetween(right - b, bottom, right, bottom);
    this.boardFrame.lineBetween(right, bottom - b, right, bottom);

    // Small decorative candy dots around the chamber.
    const dots = [
      { x: left + 10, y: top + 9, c: 0x8edff4 },
      { x: right - 10, y: top + 9, c: 0xffc95f },
      { x: left + 10, y: bottom - 9, c: 0xff79b5 },
      { x: right - 10, y: bottom - 9, c: 0xb477ff },
    ];
    for (const dot of dots) {
      this.boardFrame.fillStyle(dot.c, 0.92);
      this.boardFrame.fillCircle(dot.x, dot.y, 3.5);
      this.boardFrame.fillStyle(0xffffff, 0.75);
      this.boardFrame.fillCircle(dot.x - 1, dot.y - 1, 1.2);
    }

    this.boardFrame.setDepth(-5);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = this.pieces[r]?.[c];
        if (piece) {
          piece.container.setPosition(
            boardX + c * cell + cell / 2,
            boardY + r * cell + cell / 2
          );
        }
      }
    }
  }

  private generateBoard() {
    this.board = [];
    this.pieces = [];

    for (let r = 0; r < ROWS; r++) {
      this.board[r] = [];
      this.pieces[r] = [];

      for (let c = 0; c < COLS; c++) {
        let type: PieceType;

        do {
          type = Phaser.Math.Between(0, TYPES - 1) as PieceType;
        } while (this.wouldCreateInitialMatch(r, c, type));

        this.board[r][c] = type;
        this.pieces[r][c] = this.createPiece(type, r, c);
      }
    }
  }

  private wouldCreateInitialMatch(
    row: number,
    col: number,
    type: PieceType
  ) {
    if (
      col >= 2 &&
      this.board[row][col - 1] === type &&
      this.board[row][col - 2] === type
    ) {
      return true;
    }

    if (
      row >= 2 &&
      this.board[row - 1][col] === type &&
      this.board[row - 2][col] === type
    ) {
      return true;
    }

    return false;
  }

  private createPiece(
    type: PieceType,
    row: number,
    col: number,
    animate = false,
    special?: Piece["special"]
  ): Piece {
    const data = CANDIES[type];

    const container = this.add.container(0, 0);
    container.setDepth(10);

    const piece: Piece = {
      type,
      container,
      special,
    };

    this.drawCandy(container, data, special);

    const { cell, boardX, boardY } = this.layout;

    container.setPosition(
      boardX + col * cell + cell / 2,
      boardY + row * cell + cell / 2
    );

    if (animate) {
      container.setAlpha(0);
      container.setY(container.y - cell * 0.35);
      container.setAngle(Phaser.Math.Between(-5, 5));

      this.tweens.add({
        targets: container,
        y: boardY + row * cell + cell / 2,
        angle: 0,
        alpha: 1,
        duration: 280,
        delay: row * 30,
        ease: "Cubic.Out",
        onComplete: () => this.addCandyIdleAnimation(container),
      });
    } else {
      this.addCandyIdleAnimation(container);
    }

    return piece;
  }

  private drawCandy(
    container: Phaser.GameObjects.Container,
    data: (typeof CANDIES)[number],
    special?: Piece["special"]
  ) {
    const cell = this.layout?.cell ?? 60;
    const r = cell * 0.35;

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.48);
    shadow.fillEllipse(r * 0.10, r * 0.27, r * 1.62, r * 0.72);

    const aura = this.add.graphics();
    aura.fillStyle(data.glow, special ? 0.22 : 0.10);
    aura.fillCircle(0, 0, r * (special ? 1.18 : 1.24));

    const crystal = this.add.graphics();

    const outerPts = [
      { x: 0, y: -r * 1.05 },
      { x: r * 0.72, y: -r * 0.58 },
      { x: r * 0.98, y: 0 },
      { x: r * 0.62, y: r * 0.86 },
      { x: 0, y: r * 1.05 },
      { x: -r * 0.62, y: r * 0.86 },
      { x: -r * 0.98, y: 0 },
      { x: -r * 0.72, y: -r * 0.58 },
    ];

    crystal.fillStyle(0x01060a, 0.85);
    crystal.fillPoints(outerPts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);

    const innerPts = outerPts.map((p) => ({
      x: p.x * 0.90,
      y: p.y * 0.90,
    }));

    crystal.fillStyle(data.dark, 1);
    crystal.fillPoints(innerPts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);

    const corePts = outerPts.map((p) => ({
      x: p.x * 0.78,
      y: p.y * 0.78,
    }));

    crystal.fillStyle(data.color, 1);
    crystal.fillPoints(corePts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);

    // Faceted reflections.
    crystal.fillStyle(data.glow, 0.38);
    crystal.fillPoints([
      { x: -r * 0.58, y: -r * 0.55 },
      { x: 0, y: -r * 0.84 },
      { x: r * 0.13, y: -r * 0.15 },
      { x: -r * 0.15, y: -r * 0.03 },
    ].map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);

    crystal.fillStyle(0xffffff, 0.48);
    crystal.fillEllipse(-r * 0.27, -r * 0.42, r * 0.42, r * 0.16);

    crystal.fillStyle(0x000000, 0.16);
    crystal.fillPoints([
      { x: r * 0.12, y: -r * 0.14 },
      { x: r * 0.76, y: r * 0.04 },
      { x: r * 0.43, y: r * 0.67 },
      { x: 0, y: r * 0.83 },
    ].map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);

    crystal.lineStyle(Math.max(1.4, cell * 0.018), 0xffffff, 0.25);
    for (let i = 0; i < outerPts.length; i++) {
      const a = outerPts[i];
      const b = outerPts[(i + 1) % outerPts.length];
      crystal.lineBetween(a.x, a.y, b.x, b.y);
    }

    if (special) {
      const specialRing = this.add.graphics();
      specialRing.lineStyle(Math.max(2, cell * 0.035), data.glow, 0.75);
      specialRing.strokeCircle(0, 0, r * 0.92);
      specialRing.lineStyle(1, 0xffffff, 0.28);
      specialRing.strokeCircle(0, 0, r * 1.03);

      container.add([shadow, aura, crystal, specialRing]);

      gsap.to(specialRing, {
        angle: 360,
        duration: 3.2,
        repeat: -1,
        ease: "none",
      });
    } else {
      container.add([shadow, aura, crystal]);
    }

    const icon = this.add.text(0, r * 0.02, data.symbol, {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: `${Math.max(12, cell * 0.28)}px`,
      color: "#ffffff",
      stroke: "#081018",
      strokeThickness: Math.max(1, cell * 0.025),
    }).setOrigin(0.5);

    container.add(icon);

    if (special === "line-h" || special === "line-v") {
      const beam = this.add.graphics();
      beam.lineStyle(Math.max(2, cell * 0.035), 0xffffff, 0.92);
      if (special === "line-h") {
        beam.lineBetween(-r * 0.75, 0, r * 0.75, 0);
      } else {
        beam.lineBetween(0, -r * 0.75, 0, r * 0.75);
      }
      container.add(beam);

      gsap.to(beam, {
        alpha: 0.35,
        duration: 0.45,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }

    if (special === "bomb") {
      const core = this.add.circle(0, 0, r * 0.18, 0xffffff, 0.9);
      container.add(core);
      gsap.to(core, {
        alpha: 0.28,
        duration: 0.65,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }

    if (special === "rainbow") {
      const rainbow = this.add.graphics();
      rainbow.lineStyle(Math.max(2, cell * 0.04), 0xffffff, 0.85);
      rainbow.strokeCircle(0, 0, r * 0.66);
      container.add(rainbow);
      gsap.to(rainbow, {
        angle: 360,
        duration: 1.8,
        repeat: -1,
        ease: "none",
      });
    }
  }

  private addSpecialVisual(
    container: Phaser.GameObjects.Container,
    special: Piece["special"],
    cell: number
  ) {
    if (!special) return;

    // Persistent special markers stay inside the candy cell.
    // They do not expand beyond the piece or pulse over neighboring candies.
    const marker = this.add.graphics();

    if (special === "line-h") {
      marker.lineStyle(Math.max(2, cell * 0.035), 0xffffff, 0.92);
      marker.lineBetween(-cell * 0.22, 0, cell * 0.22, 0);
    } else if (special === "line-v") {
      marker.lineStyle(Math.max(2, cell * 0.035), 0xffffff, 0.92);
      marker.lineBetween(0, -cell * 0.22, 0, cell * 0.22);
    } else if (special === "bomb") {
      marker.lineStyle(Math.max(1.5, cell * 0.028), 0xffdf70, 0.95);
      marker.strokeCircle(0, 0, cell * 0.19);
      marker.fillStyle(0xffffff, 0.9);
      marker.fillCircle(cell * 0.11, -cell * 0.12, Math.max(1.5, cell * 0.028));
    } else if (special === "rainbow") {
      marker.lineStyle(Math.max(1.5, cell * 0.025), 0xffffff, 0.9);
      marker.strokeCircle(0, 0, cell * 0.20);
      const sparkle = this.add.text(0, 0, "âœ¦", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: `${Math.max(13, cell * 0.26)}px`,
        color: "#ffffff",
      }).setOrigin(0.5);
      container.add(sparkle);
    }

    container.add(marker);

    this.tweens.add({
      targets: marker,
      alpha: 0.62,
      duration: 380,
      yoyo: true,
      repeat: 2,
      ease: "Sine.InOut",
    });
  }

  private addCandyIdleAnimation(container: Phaser.GameObjects.Container) {
    // Keep the candy's physical position and size stable.
    // Gameplay owns X/Y while this idle animation only gives a tiny tilt.
    this.tweens.killTweensOf(container);
    this.tweens.add({
      targets: container,
      angle: Phaser.Math.FloatBetween(-1.8, 1.8),
      duration: 1500 + Phaser.Math.Between(0, 500),
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
      delay: Phaser.Math.Between(0, 250),
    });
  }

  private setupInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.gameStarted || this.busy || !pointer.isDown) return;

      this.ensureAudio();
      this.clearHint();
      this.resetHintTimer();

      const cell = this.getCellFromPointer(pointer.x, pointer.y);

      if (!cell) return;

      this.touchStartX = pointer.x;
      this.touchStartY = pointer.y;
      this.touchStartRow = cell.row;
      this.touchStartCol = cell.col;
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (
        this.busy ||
        this.touchStartRow < 0 ||
        this.touchStartCol < 0
      ) {
        this.resetTouch();
        return;
      }

      const dx = pointer.x - this.touchStartX;
      const dy = pointer.y - this.touchStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const startRow = this.touchStartRow;
      const startCol = this.touchStartCol;

      if (distance < 18) {
        this.handleBoardInput(pointer);
        this.resetTouch();
        return;
      }

      if (distance >= 28) {
        let targetRow = startRow;
        let targetCol = startCol;

        if (Math.abs(dx) > Math.abs(dy)) {
          targetCol += dx > 0 ? 1 : -1;
        } else {
          targetRow += dy > 0 ? 1 : -1;
        }

        if (
          targetRow >= 0 &&
          targetRow < ROWS &&
          targetCol >= 0 &&
          targetCol < COLS
        ) {
          this.selected = null;
          this.swapPieces(startRow, startCol, targetRow, targetCol);
        }
      }

      this.resetTouch();
    });

    if (!this.sys.game.device.input.touch) {
      this.input.on(
        "gameobjectover",
        (
          _pointer: Phaser.Input.Pointer,
          gameObject: Phaser.GameObjects.GameObject
        ) => {
          const container = gameObject as Phaser.GameObjects.Container;
          if (container && !this.busy) {
            this.tweens.add({
              targets: container,
              scale: 1.06,
              duration: 100,
            });
          }
        }
      );

      this.input.on(
        "gameobjectout",
        (
          _pointer: Phaser.Input.Pointer,
          gameObject: Phaser.GameObjects.GameObject
        ) => {
          const container = gameObject as Phaser.GameObjects.Container;
          if (container && !this.busy) {
            this.tweens.add({
              targets: container,
              scale: 1,
              duration: 100,
            });
          }
        }
      );
    }
  }

  private resetTouch() {
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartRow = -1;
    this.touchStartCol = -1;
  }

  private getCellFromPointer(x: number, y: number) {
    const { boardX, boardY, cell } = this.layout;

    const col = Math.floor((x - boardX) / cell);
    const row = Math.floor((y - boardY) / cell);

    if (
      row < 0 ||
      row >= ROWS ||
      col < 0 ||
      col >= COLS
    ) {
      return null;
    }

    return { row, col };
  }

  private handleBoardInput(pointer: Phaser.Input.Pointer) {
    const cell = this.getCellFromPointer(pointer.x, pointer.y);

    if (!this.gameStarted || !cell || this.busy || this.moves <= 0) return;

    const { row, col } = cell;

    if (!this.selected) {
      this.selectPiece(row, col);
      return;
    }

    const first = this.selected;

    if (first.row === row && first.col === col) {
      this.clearSelection();
      return;
    }

    const adjacent =
      Math.abs(first.row - row) + Math.abs(first.col - col) === 1;

    if (adjacent) {
      this.clearSelection();
      this.swapPieces(first.row, first.col, row, col);
    } else {
      this.selectPiece(row, col);
    }
  }

  private selectPiece(row: number, col: number) {
    this.clearSelection();

    this.selected = { row, col };

    const piece = this.pieces[row][col];

    if (!piece) return;

    this.tweens.add({
      targets: piece.container,
      scale: 1.06,
      duration: 120,
      ease: "Back.Out",
    });

    this.playSelectEffect(row, col);
  }

  private clearSelection() {
    if (!this.selected) return;

    const piece = this.pieces[this.selected.row]?.[this.selected.col];

    if (piece) {
      this.tweens.add({
        targets: piece.container,
        scale: 1,
        duration: 100,
      });
    }

    this.selected = null;
  }

  private playSelectEffect(row: number, col: number) {
    const { boardX, boardY, cell } = this.layout;

    const ring = this.add.graphics();

    ring.lineStyle(Math.max(2, cell * 0.04), 0xffffff, 0.85);
    ring.strokeCircle(
      boardX + col * cell + cell / 2,
      boardY + row * cell + cell / 2,
      cell * 0.39
    );

    ring.setDepth(20);

    this.tweens.add({
      targets: ring,
      scale: 1.16,
      alpha: 0,
      duration: 280,
      onComplete: () => ring.destroy(),
    });
  }

  private swapPieces(
    r1: number,
    c1: number,
    r2: number,
    c2: number
  ) {
    if (!this.gameStarted || this.busy || this.moves <= 0) return;

    const first = this.pieces[r1][c1];
    const second = this.pieces[r2][c2];

    if (!first || !second) return;

    this.busy = true;
    this.clearHint();

    // Stop any idle/selection tween before gameplay movement owns the piece.
    this.tweens.killTweensOf(first.container);
    this.tweens.killTweensOf(second.container);

    this.vibrate(18);
    this.playSwapSound();

    const { boardX, boardY, cell } = this.layout;

    const p1x = boardX + c1 * cell + cell / 2;
    const p1y = boardY + r1 * cell + cell / 2;
    const p2x = boardX + c2 * cell + cell / 2;
    const p2y = boardY + r2 * cell + cell / 2;

    first.container.setDepth(25);
    second.container.setDepth(25);

    this.tweens.add({
      targets: first.container,
      x: p2x,
      y: p2y,
      angle: c1 !== c2 ? (c2 > c1 ? 8 : -8) : 0,
      duration: 155,
      ease: "Back.Out",
    });

    this.tweens.add({
      targets: second.container,
      x: p1x,
      y: p1y,
      angle: c1 !== c2 ? (c2 > c1 ? -8 : 8) : 0,
      duration: 155,
      ease: "Back.Out",
      onComplete: () => {
        first.container.setAngle(0);
        second.container.setAngle(0);

        this.swapBoardData(r1, c1, r2, c2);

        const swappedFirst = this.pieces[r1][c1];
        const swappedSecond = this.pieces[r2][c2];

        if (
          swappedFirst?.special ||
          swappedSecond?.special
        ) {
          this.moves--;
          this.movesMade++;
          this.updateHud();

          this.vibrate(35);

          this.activateSpecialSwap(
            r1,
            c1,
            r2,
            c2
          );

          return;
        }

        const matches = this.findMatches();

        if (matches.length === 0) {
          this.vibrate(8);

          this.showNoMatch(
            (p1x + p2x) / 2,
            (p1y + p2y) / 2
          );

          this.tweens.add({
            targets: first.container,
            x: p1x,
            y: p1y,
            angle: c1 !== c2 ? (c2 > c1 ? -7 : 7) : 0,
            duration: 120,
            ease: "Quad.Out",
          });

          this.tweens.add({
            targets: second.container,
            x: p2x,
            y: p2y,
            angle: c1 !== c2 ? (c2 > c1 ? 7 : -7) : 0,
            duration: 120,
            ease: "Quad.Out",
            onComplete: () => {
              this.swapBoardData(r1, c1, r2, c2);

              first.container.setAngle(0);
              second.container.setAngle(0);
              first.container.setDepth(10);
              second.container.setDepth(10);
              this.addCandyIdleAnimation(first.container);
              this.addCandyIdleAnimation(second.container);

              this.busy = false;
              this.resetHintTimer();
            },
          });

          return;
        }

        this.moves--;
        this.movesMade++;
        this.combo = 0;

        this.vibrate(matches.length >= 5 ? 35 : 20);

        this.updateHud();
        this.resolveMatches({ row: 0, col: 0 });
      },
    });
  }

  private swapBoardData(
    r1: number,
    c1: number,
    r2: number,
    c2: number
  ) {
    const boardTemp = this.board[r1][c1];
    this.board[r1][c1] = this.board[r2][c2];
    this.board[r2][c2] = boardTemp;

    const pieceTemp = this.pieces[r1][c1];
    this.pieces[r1][c1] = this.pieces[r2][c2];
    this.pieces[r2][c2] = pieceTemp;
  }

  private findMatches(): Array<{ row: number; col: number }> {
    const matches = new Set<string>();

    for (let r = 0; r < ROWS; r++) {
      let start = 0;

      while (start < COLS) {
        const type = this.board[r][start];

        if (type === null) {
          start++;
          continue;
        }

        let end = start + 1;

        while (
          end < COLS &&
          this.board[r][end] === type
        ) {
          end++;
        }

        if (end - start >= 3) {
          for (let c = start; c < end; c++) {
            matches.add(`${r},${c}`);
          }
        }

        start = end;
      }
    }

    for (let c = 0; c < COLS; c++) {
      let start = 0;

      while (start < ROWS) {
        const type = this.board[start][c];

        if (type === null) {
          start++;
          continue;
        }

        let end = start + 1;

        while (
          end < ROWS &&
          this.board[end][c] === type
        ) {
          end++;
        }

        if (end - start >= 3) {
          for (let r = start; r < end; r++) {
            matches.add(`${r},${c}`);
          }
        }

        start = end;
      }
    }

    return Array.from(matches).map((key) => {
      const [row, col] = key.split(",").map(Number);
      return { row, col };
    });
  }

  private resolveMatches(
    preferredCell?: { row: number; col: number }
  ) {
    const matches = this.findMatches();

    if (matches.length === 0) {
      this.busy = false;
      this.resetHintTimer();

      if (this.levelCompletePending || this.isObjectiveComplete()) {
        this.levelCompletePending = false;
        this.completeLevel();
      } else if (this.moves <= 0) {
        this.handleLevelFailure("NO MOVES");
      }

      return;
    }

    const groups = this.getMatchGroups();

    const creations = this.getSpecialCreations(
      groups,
      preferredCell
    );

    const creationKeys = new Set(
      creations.map(
        (creation) =>
          `${creation.row},${creation.col}`
      )
    );

    const expanded = new Set<string>();

    for (const match of matches) {
      expanded.add(
        `${match.row},${match.col}`
      );
    }

    const specialQueue: Array<{
      row: number;
      col: number;
    }> = [];

    for (const match of matches) {
      const piece =
        this.pieces[match.row]?.[match.col];

      if (
        piece?.special &&
        !creationKeys.has(
          `${match.row},${match.col}`
        )
      ) {
        specialQueue.push(match);
      }
    }

    const processedSpecials = new Set<string>();

    while (specialQueue.length > 0) {
      const current = specialQueue.shift();

      if (!current) continue;

      const key = `${current.row},${current.col}`;

      if (processedSpecials.has(key)) {
        continue;
      }

      processedSpecials.add(key);

      const piece =
        this.pieces[current.row]?.[current.col];

      if (!piece?.special) continue;

      const effectCells =
        this.getSpecialEffectCells(
          current.row,
          current.col,
          piece.special
        );

      for (const cell of effectCells) {
        const effectKey =
          `${cell.row},${cell.col}`;

        if (!expanded.has(effectKey)) {
          expanded.add(effectKey);

          const effectPiece =
            this.pieces[cell.row]?.[cell.col];

          if (effectPiece?.special) {
            specialQueue.push(cell);
          }
        }
      }
    }

    this.combo++;

    this.bestCombo = Math.max(
      this.bestCombo,
      this.combo
    );

    this.totalCleared += expanded.size;

    this.playMatchSound(
      expanded.size,
      this.combo
    );

    if (this.combo >= 3) {
      this.playComboSound(this.combo);
      this.createComboShockwave();
    }

    const multiplier =
      1 + Math.min(Math.max(this.combo - 1, 0), 4) * 0.2;

    const points =
      Math.max(1, Math.round(expanded.size * 20 * multiplier));

    this.score += points;
    this.power = Math.min(100, this.power + expanded.size * 4);

    this.updateHud();
    this.showCombo();

    if (this.isObjectiveComplete()) {
      this.levelCompletePending = true;
    }

    if (expanded.size >= 8) {
      this.showCallout("MEGA CLEAR");
      this.flashScreen();

      this.cameras.main.shake(
        220,
        0.005
      );
    } else if (expanded.size >= 5) {
      this.showCallout("CHAIN CLEAR");

      this.cameras.main.shake(
        150,
        0.0035
      );
    }

    if (this.combo >= 2) {
      this.vibrate(
        Math.min(
          45,
          12 + this.combo * 5
        )
      );
    }

    const cells = Array.from(expanded)
      .map((key) => {
        const [row, col] =
          key.split(",").map(Number);

        return { row, col };
      });

    cells.forEach(
      (cell, index) => {
        const piece =
          this.pieces[cell.row]?.[cell.col];

        if (!piece) return;

        

        const creation =
          creations.find(
            (item) =>
              item.row === cell.row &&
              item.col === cell.col
          );

        if (
          creation &&
          !piece.special
        ) {
          piece.special =
            creation.special;
          this.specialsCreated++;

          this.addSpecialVisual(
            piece.container,
            creation.special,
            this.layout.cell
          );

          this.createSpecialChargeEffect(
            cell.row,
            cell.col,
            creation.special
          );

          this.tweens.add({
            targets: piece.container,
            angle: 12,
            y: piece.container.y - this.layout.cell * 0.08,
            duration: 170,
            ease: "Cubic.Out",
            yoyo: true,
          });

          this.createBurst(
            cell.row,
            cell.col
          );

          this.playSpecialSound(
            creation.special
          );

          return;
        }

        this.createBurst(
          cell.row,
          cell.col
        );

        this.createFloatingScore(
          cell.row,
          cell.col,
          Math.floor(
            points / Math.max(1, cells.length)
          )
        );

        const delay =
          Math.min(index * 18, 180);

        this.tweens.add({
          targets: piece.container,
          angle: Phaser.Math.Between(-8, 8),
          y: piece.container.y - this.layout.cell * 0.08,
          duration: 70,
          delay,
          ease: "Quad.Out",
          onComplete: () => {
            this.tweens.add({
              targets: piece.container,
              angle: Phaser.Math.Between(-24, 24),
              y: piece.container.y - this.layout.cell * 0.18,
              alpha: 0,
              duration: 210,
              ease: "Back.In",
              onComplete: () =>
                piece.container.destroy(),
            });
          },
        });

        this.board[cell.row][cell.col] =
          null;

        this.pieces[cell.row][cell.col] =
          null;
      }
    );

    this.time.delayedCall(
      expanded.size >= 8
        ? 430
        : 330,
      () => {
        this.collapseBoard();
      }
    );
  }

  private getMatchGroups(): Array<{
    cells: Array<{ row: number; col: number }>;
    type: PieceType;
    horizontalMax: number;
    verticalMax: number;
  }> {
    const matched = new Set<string>();

    for (let r = 0; r < ROWS; r++) {
      let start = 0;

      while (start < COLS) {
        const type = this.board[r][start];

        if (type === null) {
          start++;
          continue;
        }

        let end = start + 1;

        while (
          end < COLS &&
          this.board[r][end] === type
        ) {
          end++;
        }

        if (end - start >= 3) {
          for (let c = start; c < end; c++) {
            matched.add(`${r},${c}`);
          }
        }

        start = end;
      }
    }

    for (let c = 0; c < COLS; c++) {
      let start = 0;

      while (start < ROWS) {
        const type = this.board[start][c];

        if (type === null) {
          start++;
          continue;
        }

        let end = start + 1;

        while (
          end < ROWS &&
          this.board[end][c] === type
        ) {
          end++;
        }

        if (end - start >= 3) {
          for (let r = start; r < end; r++) {
            matched.add(`${r},${c}`);
          }
        }

        start = end;
      }
    }

    const groups: Array<{
      cells: Array<{ row: number; col: number }>;
      type: PieceType;
      horizontalMax: number;
      verticalMax: number;
    }> = [];

    const visited = new Set<string>();

    for (const startKey of matched) {
      if (visited.has(startKey)) continue;

      const [startRow, startCol] =
        startKey.split(",").map(Number);

      const type =
        this.board[startRow][startCol];

      if (type === null) continue;

      const queue = [
        {
          row: startRow,
          col: startCol,
        },
      ];

      const group: Array<{
        row: number;
        col: number;
      }> = [];

      visited.add(startKey);

      while (queue.length > 0) {
        const current = queue.shift();

        if (!current) continue;

        group.push(current);

        const neighbors = [
          {
            row: current.row - 1,
            col: current.col,
          },
          {
            row: current.row + 1,
            col: current.col,
          },
          {
            row: current.row,
            col: current.col - 1,
          },
          {
            row: current.row,
            col: current.col + 1,
          },
        ];

        for (const neighbor of neighbors) {
          if (
            neighbor.row < 0 ||
            neighbor.row >= ROWS ||
            neighbor.col < 0 ||
            neighbor.col >= COLS
          ) {
            continue;
          }

          const key = `${neighbor.row},${neighbor.col}`;

          if (
            visited.has(key) ||
            !matched.has(key)
          ) {
            continue;
          }

          if (
            this.board[neighbor.row][neighbor.col] !==
            type
          ) {
            continue;
          }

          visited.add(key);
          queue.push(neighbor);
        }
      }

      const groupSet = new Set(
        group.map(
          (cell) =>
            `${cell.row},${cell.col}`
        )
      );

      let horizontalMax = 1;
      let verticalMax = 1;

      for (const cell of group) {
        let horizontal = 1;

        let left = cell.col - 1;

        while (
          groupSet.has(
            `${cell.row},${left}`
          )
        ) {
          horizontal++;
          left--;
        }

        let right = cell.col + 1;

        while (
          groupSet.has(
            `${cell.row},${right}`
          )
        ) {
          horizontal++;
          right++;
        }

        horizontalMax = Math.max(
          horizontalMax,
          horizontal
        );

        let vertical = 1;

        let up = cell.row - 1;

        while (
          groupSet.has(
            `${up},${cell.col}`
          )
        ) {
          vertical++;
          up--;
        }

        let down = cell.row + 1;

        while (
          groupSet.has(
            `${down},${cell.col}`
          )
        ) {
          vertical++;
          down++;
        }

        verticalMax = Math.max(
          verticalMax,
          vertical
        );
      }

      groups.push({
        cells: group,
        type,
        horizontalMax,
        verticalMax,
      });
    }

    return groups;
  }

  private getSpecialCreations(
    groups: Array<{
      cells: Array<{ row: number; col: number }>;
      type: PieceType;
      horizontalMax: number;
      verticalMax: number;
    }>,
    preferredCell?: {
      row: number;
      col: number;
    }
  ): Array<{
    row: number;
    col: number;
    special: Piece["special"];
  }> {
    const creations: Array<{
      row: number;
      col: number;
      special: Piece["special"];
    }> = [];

    for (const group of groups) {
      let special: Piece["special"] =
        undefined;

      if (
        group.horizontalMax >= 5 ||
        group.verticalMax >= 5
      ) {
        special = "rainbow";
      } else if (
        group.horizontalMax >= 3 &&
        group.verticalMax >= 3
      ) {
        special = "bomb";
      } else if (
        group.horizontalMax >= 4
      ) {
        special = "line-h";
      } else if (
        group.verticalMax >= 4
      ) {
        special = "line-v";
      }

      if (!special) continue;

      let chosen =
        group.cells[0];

      if (
        preferredCell &&
        group.cells.some(
          (cell) =>
            cell.row === preferredCell.row &&
            cell.col === preferredCell.col
        )
      ) {
        chosen = preferredCell;
      } else {
        let bestScore = -1;

        for (const cell of group.cells) {
          let horizontal = 1;
          let vertical = 1;

          let left = cell.col - 1;

          while (
            group.cells.some(
              (item) =>
                item.row === cell.row &&
                item.col === left
            )
          ) {
            horizontal++;
            left--;
          }

          let right = cell.col + 1;

          while (
            group.cells.some(
              (item) =>
                item.row === cell.row &&
                item.col === right
            )
          ) {
            horizontal++;
            right++;
          }

          let up = cell.row - 1;

          while (
            group.cells.some(
              (item) =>
                item.row === up &&
                item.col === cell.col
            )
          ) {
            vertical++;
            up--;
          }

          let down = cell.row + 1;

          while (
            group.cells.some(
              (item) =>
                item.row === down &&
                item.col === cell.col
            )
          ) {
            vertical++;
            down++;
          }

          const score =
            horizontal + vertical;

          if (score > bestScore) {
            bestScore = score;
            chosen = cell;
          }
        }
      }

      creations.push({
        row: chosen.row,
        col: chosen.col,
        special,
      });
    }

    return creations;
  }

  private getSpecialEffectCells(
    row: number,
    col: number,
    special: Piece["special"]
  ): Array<{ row: number; col: number }> {
    const cells: Array<{
      row: number;
      col: number;
    }> = [];

    if (special === "line-h") {
      for (let c = 0; c < COLS; c++) {
        cells.push({
          row,
          col: c,
        });
      }
    }

    if (special === "line-v") {
      for (let r = 0; r < ROWS; r++) {
        cells.push({
          row: r,
          col,
        });
      }
    }

    if (special === "bomb") {
      for (
        let r = row - 2;
        r <= row + 2;
        r++
      ) {
        for (
          let c = col - 2;
          c <= col + 2;
          c++
        ) {
          if (
            r >= 0 &&
            r < ROWS &&
            c >= 0 &&
            c < COLS
          ) {
            cells.push({
              row: r,
              col: c,
            });
          }
        }
      }
    }

    if (special === "rainbow") {
      const target =
        this.board[row][col];

      if (target !== null) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (
              this.board[r][c] === target
            ) {
              cells.push({
                row: r,
                col: c,
              });
            }
          }
        }
      }
    }

    return cells;
  }

  private activateSpecialSwap(
    r1: number,
    c1: number,
    r2: number,
    c2: number
  ) {
    const first =
      this.pieces[r1][c1];

    const second =
      this.pieces[r2][c2];

    if (!first || !second) {
      this.busy = false;
      return;
    }

    const firstSpecial =
      first.special;

    const secondSpecial =
      second.special;

    this.playSpecialComboSound(
      firstSpecial,
      secondSpecial
    );

    const cells = new Set<string>();

    const addCell = (
      row: number,
      col: number
    ) => {
      if (
        row >= 0 &&
        row < ROWS &&
        col >= 0 &&
        col < COLS
      ) {
        cells.add(`${row},${col}`);
      }
    };

    const addRows = (
      center: number,
      amount: number
    ) => {
      const half =
        Math.floor(amount / 2);

      for (
        let r = center - half;
        r <= center + half;
        r++
      ) {
        if (
          r >= 0 &&
          r < ROWS
        ) {
          for (
            let c = 0;
            c < COLS;
            c++
          ) {
            addCell(r, c);
          }
        }
      }
    };

    const addColumns = (
      center: number,
      amount: number
    ) => {
      const half =
        Math.floor(amount / 2);

      for (
        let c = center - half;
        c <= center + half;
        c++
      ) {
        if (
          c >= 0 &&
          c < COLS
        ) {
          for (
            let r = 0;
            r < ROWS;
            r++
          ) {
            addCell(r, c);
          }
        }
      }
    };

    if (firstSpecial && !secondSpecial) {
      for (const cell of this.getSpecialEffectCells(r1, c1, firstSpecial)) {
        addCell(cell.row, cell.col);
      }
      this.showCallout(firstSpecial === "bomb" ? "MEGA BOMB" : "SPECIAL BLAST");
    } else if (secondSpecial && !firstSpecial) {
      for (const cell of this.getSpecialEffectCells(r2, c2, secondSpecial)) {
        addCell(cell.row, cell.col);
      }
      this.showCallout(secondSpecial === "bomb" ? "MEGA BOMB" : "SPECIAL BLAST");
    } else if (
      firstSpecial === "rainbow" &&
      secondSpecial === "rainbow"
    ) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          addCell(r, c);
        }
      }

      this.showCallout(
        "RAINBOW FUSION"
      );
    } else if (
      firstSpecial === "rainbow" ||
      secondSpecial === "rainbow"
    ) {
      const rainbow =
        firstSpecial === "rainbow"
          ? first
          : second;

      const target =
        firstSpecial === "rainbow"
          ? second
          : first;

      if (target.special === "line-h") {
        addRows(
          firstSpecial === "rainbow"
            ? r2
            : r1,
          3
        );
      }

      if (target.special === "line-v") {
        addColumns(
          firstSpecial === "rainbow"
            ? c2
            : c1,
          3
        );
      }

      if (target.special === "bomb") {
        const centerRow =
          firstSpecial === "rainbow"
            ? r2
            : r1;

        const centerCol =
          firstSpecial === "rainbow"
            ? c2
            : c1;

        for (
          let r = centerRow - 2;
          r <= centerRow + 2;
          r++
        ) {
          for (
            let c = centerCol - 2;
            c <= centerCol + 2;
            c++
          ) {
            addCell(r, c);
          }
        }
      }

      const targetType =
        target.type;

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (
            this.board[r][c] ===
            targetType
          ) {
            addCell(r, c);

            const piece =
              this.pieces[r][c];

            if (piece?.special) {
              for (
                const effect of
                  this.getSpecialEffectCells(
                    r,
                    c,
                    piece.special
                  )
              ) {
                addCell(
                  effect.row,
                  effect.col
                );
              }
            }
          }
        }
      }

      this.showCallout(
        target.special === "bomb"
          ? "RAINBOW BOMB"
          : "RAINBOW BLAST"
      );

      void rainbow;
    } else if (
      firstSpecial?.startsWith("line") &&
      secondSpecial?.startsWith("line")
    ) {
      addRows(r1, 1);
      addRows(r2, 1);
      addColumns(c1, 1);
      addColumns(c2, 1);

      this.showCallout(
        "CROSS BLAST"
      );
    } else if (
      (
        firstSpecial?.startsWith("line") &&
        secondSpecial === "bomb"
      ) ||
      (
        secondSpecial?.startsWith("line") &&
        firstSpecial === "bomb"
      )
    ) {
      const line =
        firstSpecial?.startsWith("line")
          ? first
          : second;

      const lineRow =
        firstSpecial?.startsWith("line")
          ? r1
          : r2;

      const lineCol =
        firstSpecial?.startsWith("line")
          ? c1
          : c2;

      if (line.special === "line-h") {
        addRows(lineRow, 3);
        addColumns(lineCol, 3);
      } else {
        addColumns(lineCol, 3);
        addRows(lineRow, 3);
      }

      for (
        let r = lineRow - 2;
        r <= lineRow + 2;
        r++
      ) {
        for (
          let c = lineCol - 2;
          c <= lineCol + 2;
          c++
        ) {
          addCell(r, c);
        }
      }

      this.showCallout(
        "SUPER BLAST"
      );
    } else if (
      firstSpecial === "bomb" &&
      secondSpecial === "bomb"
    ) {
      for (
        let r = r1 - 2;
        r <= r1 + 2;
        r++
      ) {
        for (
          let c = c1 - 2;
          c <= c1 + 2;
          c++
        ) {
          addCell(r, c);
        }
      }

      for (
        let r = r2 - 2;
        r <= r2 + 2;
        r++
      ) {
        for (
          let c = c2 - 2;
          c <= c2 + 2;
          c++
        ) {
          addCell(r, c);
        }
      }

      this.showCallout(
        "DOUBLE BOMB"
      );
    }

    addCell(r1, c1);
    addCell(r2, c2);

    const queue =
      Array.from(cells).map(
        (key) => {
          const [row, col] =
            key.split(",").map(Number);

          return { row, col };
        }
      );

    const processed =
      new Set<string>();

    while (queue.length > 0) {
      const current =
        queue.shift();

      if (!current) continue;

      const key = `${current.row},${current.col}`;

      if (processed.has(key)) {
        continue;
      }

      processed.add(key);

      const piece =
        this.pieces[current.row]?.[
          current.col
        ];

      if (!piece?.special) {
        continue;
      }

      for (
        const effect of
          this.getSpecialEffectCells(
            current.row,
            current.col,
            piece.special
          )
      ) {
        const effectKey =
          `${effect.row},${effect.col}`;

        if (!cells.has(effectKey)) {
          cells.add(effectKey);
          queue.push(effect);
        }
      }
    }

    this.clearSpecialCells(
      Array.from(cells).map(
        (key) => {
          const [row, col] =
            key.split(",").map(Number);

          return { row, col };
        }
      )
    );
  }

  private clearSpecialCells(
    cells: Array<{
      row: number;
      col: number;
    }>
  ) {
    const unique = new Map<
      string,
      { row: number; col: number }
    >();

    for (const cell of cells) {
      unique.set(
        `${cell.row},${cell.col}`,
        cell
      );
    }

    const finalCells =
      Array.from(unique.values());

    const bonus =
      finalCells.length *
      (60 + Math.min(this.combo, 5) * 10);

    this.totalCleared += finalCells.length;

    this.score += bonus;

    this.updateHud();

    this.flashScreen();
    this.playSpecialBlastSound(finalCells.length);

    this.cameras.main.shake(
      260,
      0.006
    );

    this.vibrate(55);

    finalCells.forEach(
      (cell, index) => {
        const piece =
          this.pieces[cell.row]?.[
            cell.col
          ];

        if (!piece) return;

        this.createBurst(
          cell.row,
          cell.col
        );

        this.createFloatingScore(
          cell.row,
          cell.col,
          Math.max(
            50,
            Math.floor(
              bonus /
                Math.max(
                  1,
                  finalCells.length
                )
            )
          )
        );

        this.tweens.add({
          targets: piece.container,
          angle: Phaser.Math.Between(-35, 35),
          y: piece.container.y - this.layout.cell * 0.22,
          alpha: 0,
          delay: Math.min(
            index * 14,
            180
          ),
          duration: 270,
          ease: "Back.In",
          onComplete: () =>
            piece.container.destroy(),
        });

        this.board[cell.row][cell.col] =
          null;

        this.pieces[cell.row][cell.col] =
          null;
      }
    );

    this.time.delayedCall(
      420,
      () => this.collapseBoard()
    );
  }

  private collapseBoard() {
    const { boardX, boardY, cell } = this.layout;

    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;

      for (let r = ROWS - 1; r >= 0; r--) {
        const piece = this.pieces[r][c];

        if (!piece) continue;

        if (writeRow !== r) {
          this.tweens.killTweensOf(piece.container);
          this.pieces[writeRow][c] = piece;
          this.board[writeRow][c] = piece.type;

          this.pieces[r][c] = null;
          this.board[r][c] = null;

          const targetY =
            boardY + writeRow * cell + cell / 2;

          this.tweens.add({
            targets: piece.container,
            x: boardX + c * cell + cell / 2,
            y: targetY,
            duration: 240 + (writeRow - r) * 35,
            ease: "Bounce.Out",
          });
        }

        writeRow--;
      }

      for (let r = writeRow; r >= 0; r--) {
        const type = Phaser.Math.Between(0, TYPES - 1) as PieceType;

        this.board[r][c] = type;

        const piece = this.createPiece(type, r, c, true);

        piece.container.y =
          boardY - (writeRow - r + 1) * cell;

        this.pieces[r][c] = piece;

        const targetY =
          boardY + r * cell + cell / 2;

        this.tweens.add({
          targets: piece.container,
          y: targetY,
          duration: 280 + (writeRow - r) * 30,
          ease: "Bounce.Out",
        });
      }
    }

    this.time.delayedCall(760, () => {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const piece = this.pieces[r]?.[c];
          if (piece) this.addCandyIdleAnimation(piece.container);
        }
      }

      const matches = this.findMatches();

      if (matches.length > 0) {
        this.showCallout(
          this.combo >= 3
            ? `CASCADE Ã—${this.combo}`
            : "CASCADE"
        );
        this.playTone(
          740 + Math.min(this.combo, 6) * 35,
          0.12,
          0.035,
          "triangle"
        );
        this.resolveMatches({ row: 0, col: 0 });
      } else {
        this.maybeSpawnBonusBomb();
        this.busy = false;

        if (this.levelCompletePending || this.isObjectiveComplete()) {
          this.levelCompletePending = false;
          this.completeLevel();
        } else if (this.moves <= 0) {
          this.handleLevelFailure("NO MOVES");
        }
      }
    });
  }

  private maybeSpawnBonusBomb() {
    if (this.movesMade < 6 || this.movesMade % 8 !== 0 || this.moves <= 0) return;

    const candidates: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = this.pieces[r]?.[c];
        if (piece && !piece.special) candidates.push({ row: r, col: c });
      }
    }

    if (!candidates.length) return;

    const chosen = Phaser.Utils.Array.GetRandom(candidates);
    const piece = this.pieces[chosen.row][chosen.col];
    if (!piece) return;

    piece.special = "bomb";
    this.specialsCreated++;
    this.addSpecialVisual(piece.container, "bomb", this.layout.cell);
    this.createSpecialChargeEffect(chosen.row, chosen.col, "bomb");
    this.showCallout("BONUS BOMB!");
    this.playSpecialSound("bomb");
    this.vibrate(45);

    const { boardX, boardY, cell } = this.layout;
    const x = boardX + chosen.col * cell + cell / 2;
    const y = boardY + chosen.row * cell + cell / 2;
    const label = this.add.text(x, y - cell * 0.55, "POWER", {
      fontFamily: "Arial", fontSize: `${Math.max(18, cell * 0.32)}px`,
    }).setOrigin(0.5).setDepth(70);

    this.tweens.add({
      targets: label,
      y: y - cell * 0.95,
      alpha: 0,
      duration: 850,
      ease: "Cubic.Out",
      onComplete: () => label.destroy(),
    });
  }

  private createBurst(row: number, col: number) {
    const { boardX, boardY, cell } = this.layout;

    const x = boardX + col * cell + cell / 2;
    const y = boardY + row * cell + cell / 2;

    const ring = this.add.graphics();

    ring.lineStyle(Math.max(2, cell * 0.035), 0xffffff, 0.8);
    ring.strokeCircle(x, y, cell * 0.18);
    ring.setDepth(30);

    this.tweens.add({
      targets: ring,
      scale: 2.5,
      alpha: 0,
      duration: 300,
      onComplete: () => ring.destroy(),
    });

    for (let i = 0; i < 14; i++) {
      const particle = this.add.circle(
        x,
        y,
        Math.max(1.5, cell * 0.035),
        0xffffff,
        0.95
      );

      particle.setDepth(31);

      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(
        Math.floor(cell * 0.45),
        Math.floor(cell * 1.15)
      );

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(260, 430),
        ease: "Quad.Out",
        onComplete: () => particle.destroy(),
      });
    }
  }

  private createFloatingScore(
    row: number,
    col: number,
    points: number
  ) {
    const { boardX, boardY, cell } = this.layout;

    const text = this.add
      .text(
        boardX + col * cell + cell / 2,
        boardY + row * cell + cell / 2,
        `+${points}`,
        {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: `${Math.max(14, cell * 0.24)}px`,
          color: "#ffffff",
          stroke: "#07121c",
          strokeThickness: 4,
        }
      )
      .setOrigin(0.5)
      .setDepth(40);

    this.tweens.add({
      targets: text,
      y: text.y - cell * 0.8,
      alpha: 0,
      scale: 1.25,
      duration: 600,
      ease: "Cubic.Out",
      onComplete: () => text.destroy(),
    });
  }

  private flashScreen() {
    const flash = this.add.rectangle(
      0,
      0,
      this.layout.width,
      this.layout.height,
      0xffffff,
      0.13
    );

    flash.setOrigin(0);
    flash.setDepth(100);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 180,
      onComplete: () => flash.destroy(),
    });
  }

  private showNoMatch(x: number, y: number) {
    const text = this.add
      .text(x, y, "NO MATCH", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: `${Math.max(13, this.layout.width * 0.035)}px`,
        color: "#ff7892",
        stroke: "#07121c",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(80);

    this.tweens.add({
      targets: text,
      y: y - this.layout.cell * 0.55,
      alpha: 0,
      scale: 1.15,
      duration: 650,
      ease: "Cubic.Out",
      onComplete: () => text.destroy(),
    });

    const pulse = this.add.circle(
      x,
      y,
      this.layout.cell * 0.24,
      0xff5577,
      0.08
    );

    pulse.setStrokeStyle(2, 0xff5577, 0.7);
    pulse.setDepth(79);

    this.tweens.add({
      targets: pulse,
      scale: 2.2,
      alpha: 0,
      duration: 280,
      onComplete: () => pulse.destroy(),
    });

    this.cameras.main.shake(90, 0.0025);
  }

  private showCallout(message: string) {
    const text = this.add
      .text(
        this.layout.width / 2,
        this.layout.boardY - this.layout.cell * 0.62,
        message,
        {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: `${Math.max(14, this.layout.width * 0.038)}px`,
          color: "#ffffff",
          stroke: "#07121c",
          strokeThickness: 7,
        }
      )
      .setOrigin(0.5)
      .setDepth(90)
      .setScale(0.55)
      .setAlpha(0);

    this.tweens.add({
      targets: text,
      scale: 1,
      alpha: 1,
      duration: 180,
      ease: "Back.Out",
      onComplete: () => {
        this.tweens.add({
          targets: text,
          y: text.y - this.layout.cell * 0.3,
          alpha: 0,
          duration: 520,
          delay: 350,
          ease: "Cubic.In",
          onComplete: () => text.destroy(),
        });
      },
    });
  }

  private ensureAudio() {
    if (this.soundReady) {
      if (this.audioContext?.state === "suspended") {
        void this.audioContext.resume();
      }
      return;
    }

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;

      if (!AudioContextClass) return;

      this.audioContext = new AudioContextClass();
      this.soundReady = true;

      if (this.audioContext.state === "suspended") {
        void this.audioContext.resume();
      }
    } catch {
      this.soundReady = false;
    }
  }

  private playTone(
    frequency: number,
    duration: number,
    volume = 0.035,
    type: OscillatorType = "sine"
  ) {
    this.ensureAudio();

    const context = this.audioContext;
    if (!context) return;

    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(
        frequency,
        now
      );

      gain.gain.setValueAtTime(
        0.0001,
        now
      );
      gain.gain.exponentialRampToValueAtTime(
        volume,
        now + 0.012
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + duration
      );

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    } catch {
      // Audio is optional.
    }
  }

  private playSwapSound() {
    this.playTone(
      280,
      0.07,
      0.025,
      "triangle"
    );
  }

  private playMatchSound(
    cleared: number,
    combo: number
  ) {
    const base =
      420 +
      Math.min(cleared, 12) * 18 +
      Math.min(combo, 6) * 22;

    this.playTone(
      base,
      0.11,
      0.035,
      "sine"
    );

    if (cleared >= 5) {
      this.time.delayedCall(65, () => {
        this.playTone(
          base * 1.35,
          0.14,
          0.03,
          "sine"
        );
      });
    }
  }

  private playComboSound(combo: number) {
    const notes = [
      523.25,
      659.25,
      783.99,
      987.77,
      1174.66,
    ];

    const note =
      notes[Math.min(combo - 3, notes.length - 1)];

    this.playTone(
      note,
      0.16,
      0.045,
      "triangle"
    );
  }

  private playSpecialSound(
    special: Piece["special"]
  ) {
    if (special === "rainbow") {
      this.playTone(
        880,
        0.18,
        0.045,
        "sine"
      );

      this.time.delayedCall(80, () => {
        this.playTone(
          1174.66,
          0.2,
          0.04,
          "sine"
        );
      });

      return;
    }

    this.playTone(
      special === "bomb"
        ? 120
        : 620,
      0.16,
      0.045,
      special === "bomb"
        ? "square"
        : "triangle"
    );
  }

  private playSpecialComboSound(
    first: Piece["special"],
    second: Piece["special"]
  ) {
    if (!first || !second) return;

    this.playTone(
      160,
      0.1,
      0.045,
      "square"
    );

    this.time.delayedCall(70, () => {
      this.playTone(
        480,
        0.13,
        0.05,
        "triangle"
      );
    });

    this.time.delayedCall(150, () => {
      this.playTone(
        960,
        0.18,
        0.045,
        "sine"
      );
    });
  }

  private playSpecialBlastSound(
    count: number
  ) {
    const frequency =
      count >= 25
        ? 90
        : count >= 12
          ? 140
          : 220;

    this.playTone(
      frequency,
      0.2,
      0.055,
      "square"
    );

    this.time.delayedCall(80, () => {
      this.playTone(
        frequency * 2,
        0.18,
        0.035,
        "triangle"
      );
    });
  }

  private createSpecialChargeEffect(
    row: number,
    col: number,
    special: Piece["special"]
  ) {
    const { boardX, boardY, cell } = this.layout;
    const x = boardX + col * cell + cell / 2;
    const y = boardY + row * cell + cell / 2;

    const ringColor =
      special === "rainbow"
        ? 0xffffff
        : special === "bomb"
          ? 0xffd34d
          : 0xff74ad;

    // Small burst kept behind the candy so it cannot cover neighboring pieces.
    const ring = this.add.graphics();
    ring.lineStyle(Math.max(1.5, cell * 0.022), ringColor, 0.72);
    ring.strokeCircle(x, y, cell * 0.24);
    ring.setDepth(9);
    ring.setScale(0.72);

    this.tweens.add({
      targets: ring,
      scale: 1.02,
      alpha: 0,
      duration: 260,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });

    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI * 2 * i) / 4 + Math.PI / 4;
      const spark = this.add.circle(
        x,
        y,
        Math.max(1, cell * 0.018),
        ringColor,
        0.75
      ).setDepth(9);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * cell * 0.34,
        y: y + Math.sin(angle) * cell * 0.34,
        alpha: 0,
        duration: 240,
        ease: "Cubic.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private createComboShockwave() {
    const { width, height } =
      this.layout;

    const ring = this.add.graphics();

    ring.lineStyle(
      Math.max(2, width * 0.004),
      0xff74ad,
      0.35
    );

    ring.strokeCircle(
      width / 2,
      height * 0.5,
      Math.min(width, height) * 0.045
    );

    ring.setDepth(75);

    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 360,
      ease: "Cubic.Out",
      onComplete: () =>
        ring.destroy(),
    });
  }

  private vibrate(duration: number) {
    try {
      if ("vibrate" in navigator) {
        navigator.vibrate(duration);
      }
    } catch {
      // Vibration is optional.
    }
  }

  private resetHintTimer() {
    this.clearHint();

    if (this.moves <= 0 || this.busy) return;

    if (this.hintTimer) {
      this.hintTimer.remove(false);
    }

    this.hintTimer = this.time.delayedCall(4200, () => {
      if (!this.busy && this.moves > 0) {
        this.showHint();
      }
    });
  }

  private clearHint() {
    for (const object of this.hintObjects) {
      if (object.active) {
        object.destroy();
      }
    }

    this.hintObjects = [];
    this.hintActive = false;
  }

  private findHintMove():
    | { r1: number; c1: number; r2: number; c2: number }
    | null {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c < COLS - 1) {
          this.swapBoardData(r, c, r, c + 1);

          const match = this.findMatches();

          this.swapBoardData(r, c, r, c + 1);

          if (match.length > 0) {
            return {
              r1: r,
              c1: c,
              r2: r,
              c2: c + 1,
            };
          }
        }

        if (r < ROWS - 1) {
          this.swapBoardData(r, c, r + 1, c);

          const match = this.findMatches();

          this.swapBoardData(r, c, r + 1, c);

          if (match.length > 0) {
            return {
              r1: r,
              c1: c,
              r2: r + 1,
              c2: c,
            };
          }
        }
      }
    }

    return null;
  }

  private showHint() {
    if (this.busy || this.moves <= 0 || this.hintActive) return;

    const hint = this.findHintMove();

    if (!hint) {
      this.shuffleBoard();
      return;
    }

    this.hintActive = true;

    const cells = [
      { row: hint.r1, col: hint.c1 },
      { row: hint.r2, col: hint.c2 },
    ];

    for (const cell of cells) {
      const { boardX, boardY, cell: size } = this.layout;

      const ring = this.add.graphics();

      ring.lineStyle(
        Math.max(2, size * 0.045),
        0xff74ad,
        0.95
      );

      ring.strokeCircle(
        boardX + cell.col * size + size / 2,
        boardY + cell.row * size + size / 2,
        size * 0.42
      );

      ring.setDepth(60);

      const originX = ring.x;
      const originY = ring.y;

      ring.setData("originX", originX);
      ring.setData("originY", originY);

      this.tweens.add({
        targets: ring,
        alpha: 0.15,
        scale: 1.16,
        duration: 500,
        yoyo: true,
        repeat: 2,
        ease: "Sine.InOut",
        onComplete: () => {
          if (ring.active) ring.destroy();
        },
      });

      this.hintObjects.push(ring);
    }

    const { boardX, boardY, cell: size } = this.layout;

    const arrow = this.add.text(
      boardX +
        ((hint.c1 + hint.c2) / 2) * size +
        size / 2,
      boardY +
        ((hint.r1 + hint.r2) / 2) * size +
        size / 2,
      "â†”",
      {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: `${Math.max(22, size * 0.42)}px`,
        color: "#7affdf",
        stroke: "#07121c",
        strokeThickness: 5,
      }
    );

    arrow.setOrigin(0.5);
    arrow.setDepth(61);

    this.hintObjects.push(arrow);

    this.time.delayedCall(1900, () => {
      this.clearHint();
      this.resetHintTimer();
    });
  }

  private hasPossibleMove(): boolean {
    return this.findHintMove() !== null;
  }

  private shuffleBoard() {
    if (this.busy) return;

    this.busy = true;
    this.clearHint();

    this.showCallout("RESHUFFLING");

    const types: PieceType[] = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const type = this.board[r][c];

        if (type !== null) {
          types.push(type);
        }
      }
    }

    let attempts = 0;

    do {
      Phaser.Utils.Array.Shuffle(types);

      let index = 0;

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          this.board[r][c] = types[index++];
        }
      }

      attempts++;
    } while (
      (this.findMatches().length > 0 ||
        !this.hasPossibleMove()) &&
      attempts < 100
    );

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = this.pieces[r][c];

        if (piece) {
          this.tweens.add({
            targets: piece.container,
            scale: 0,
            alpha: 0,
            angle: Phaser.Math.Between(-25, 25),
            duration: 180 + (r + c) * 12,
            onComplete: () => piece.container.destroy(),
          });
        }
      }
    }

    this.time.delayedCall(300, () => {
      this.pieces = [];

      for (let r = 0; r < ROWS; r++) {
        this.pieces[r] = [];

        for (let c = 0; c < COLS; c++) {
          const type = this.board[r][c] as PieceType;

          const piece = this.createPiece(
            type,
            r,
            c,
            true
          );

          this.pieces[r][c] = piece;
        }
      }

      this.time.delayedCall(600, () => {
        this.busy = false;
        this.resetHintTimer();
      });
    });
  }

  private showCombo() {
    this.comboText.setText(this.combo > 1 ? `COMBO Ã—${this.combo}` : "");

    if (this.combo <= 1) {
      this.comboText.setAlpha(0);
      this.comboBuddy?.setAlpha(0);
      return;
    }

    this.comboText.setAlpha(1);
    this.comboText.setScale(1);
    this.tweens.killTweensOf(this.comboText);
    this.tweens.add({
      targets: this.comboText,
      y: this.comboText.y - 5,
      duration: 160,
      yoyo: true,
      ease: "Sine.Out",
    });

    this.comboText.setColor(this.combo >= 5 ? "#ffbf38" : this.combo >= 3 ? "#ff5e9f" : "#8b4f87");

    if (this.combo >= 3 && this.comboBuddy) {
      this.comboBuddy.setAlpha(1);
      this.tweens.killTweensOf(this.comboBuddy);
      this.tweens.add({
        targets: this.comboBuddy,
        x: this.comboBuddy.x + 8,
        duration: 220,
        yoyo: true,
        ease: "Back.Out",
      });
    } else {
      this.comboBuddy?.setAlpha(0);
    }
  }

  private updateHud() {
    this.scoreText.setText(
      this.score.toString().padStart(6, "0")
    );

    this.movesText.setText(this.moves.toString());
    this.timerText?.setText(this.formatTime(this.timeLeft));
    this.objectiveText?.setText("MISSION");
    this.objectiveBadgeText?.setText(this.getObjectiveLabel().replace(/^MISSION â€¢ /, "").replace(" CRYSTALS", ""));
    this.levelBadgeText?.setText(String(this.level));
    this.starsText?.setText(this.level >= 3 ? "â˜… â˜… â˜…" : this.level === 2 ? "â˜… â˜… â˜†" : "â˜… â˜† â˜†");
    this.layoutHud();
  }

  private startLevelTimer() {
    if (this.timerEvent) {
      this.timerEvent.remove(false);
    }
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (!this.gameStarted || this.busy) return;

        this.timeLeft = Math.max(0, this.timeLeft - 1);
        this.updateHud();

        if (this.timeLeft <= 0) {
          this.handleLevelFailure("TIME UP");
        }
      },
    });
  }

  private isLastLevel(): boolean {
    return this.level >= LEVELS.length;
  }

  private completeLevel() {
    if (this.busy || !this.gameStarted) return;

    this.busy = true;
    if (this.timerEvent) this.timerEvent.paused = true;

    this.playTone(523.25, 0.16, 0.05, "triangle");
    this.time.delayedCall(120, () => this.playTone(659.25, 0.16, 0.05, "triangle"));
    this.time.delayedCall(240, () => this.playTone(783.99, 0.24, 0.06, "sine"));

    const bonus = Math.max(0, this.timeLeft) * 5 + this.moves * 15;
    this.score += bonus;

    if (this.isLastLevel()) {
      this.showEndScreen(true);
      return;
    }

    this.showLevelCompleteOverlay(bonus);
  }

  private continueToNextLevel() {
    this.level++;
    const config = this.getLevelConfig();
    this.updateLevelBackground(true);

    this.moves = config.moves;
    this.timeLeft = config.time;
    this.combo = 0;
    this.power = 0;
    this.totalCleared = 0;
    this.specialsCreated = 0;
    this.levelCompletePending = false;
    this.busy = false;

    this.generateBoard();
    this.updateHud();

    if (this.timerEvent) this.timerEvent.paused = false;
    this.startLevelTimer();
    this.resetHintTimer();

    const flash = this.add.rectangle(0, 0, this.layout.width, this.layout.height, 0x06121c, 0.88)
      .setOrigin(0)
      .setDepth(250);

    const label = this.add.text(
      this.layout.width / 2,
      this.layout.height / 2,
      `LEVEL ${this.level}\n${config.name}`,
      {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: `${Math.min(42, this.layout.width * 0.085)}px`,
        color: "#ffffff",
        align: "center",
        stroke: "#07121c",
        strokeThickness: 7,
      }
    ).setOrigin(0.5).setDepth(251).setAlpha(0).setScale(0.65);

    this.tweens.add({
      targets: label,
      alpha: 1,
      scale: 1,
      duration: 420,
      ease: "Back.Out",
    });

    this.tweens.add({
      targets: [flash, label],
      alpha: 0,
      duration: 650,
      delay: 650,
      onComplete: () => {
        flash.destroy();
        label.destroy();
      },
    });
  }

  private handleLevelFailure(reason: string) {
    if (this.busy || !this.gameStarted) return;

    this.busy = true;
    if (this.timerEvent) this.timerEvent.paused = true;

    this.lives--;
    this.playTone(170, 0.22, 0.04, "sawtooth");

    if (this.lives <= 0) {
      this.showEndScreen(false);
      return;
    }

    this.showLifeLostOverlay(reason);
  }

  private showLifeLostOverlay(reason: string) {
    const { width, height } = this.layout;
    const overlay = this.add.rectangle(0, 0, width, height, 0x02070b, 0.72)
      .setOrigin(0)
      .setDepth(220);

    const title = this.add.text(width / 2, height * 0.36, reason, {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: `${Math.min(32, width * 0.07)}px`,
      color: "#ff708b",
    }).setOrigin(0.5).setDepth(221);

    const detail = this.add.text(width / 2, height * 0.45,
      `${this.lives} LIFE${this.lives === 1 ? "" : "S"} LEFT\nKEEP HUNTING`,
      {
        fontFamily: "Arial, sans-serif",
        fontSize: `${Math.min(20, width * 0.045)}px`,
        color: "#e4f3f7",
        align: "center",
        lineSpacing: 8,
      }
    ).setOrigin(0.5).setDepth(221);

    const button = this.add.rectangle(width / 2, height * 0.60, Math.min(width - 70, 250), 56, 0x18a6a0, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(221);

    const buttonText = this.add.text(width / 2, height * 0.60, "CONTINUE", {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: `${Math.min(18, width * 0.043)}px`,
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(222);

    [title, detail, button, buttonText].forEach((obj) => {
      obj.setAlpha(0);
    });

    this.tweens.add({
      targets: [title, detail, button, buttonText],
      alpha: 1,
      duration: 300,
    });

    button.on("pointerup", () => {
      overlay.destroy();
      title.destroy();
      detail.destroy();
      button.destroy();
      buttonText.destroy();

      const config = this.getLevelConfig();
      this.moves = config.moves;
      this.timeLeft = config.time;
      this.combo = 0;
      this.power = 0;
      this.levelCompletePending = false;
      this.generateBoard();
      this.updateHud();
      this.busy = false;
      if (this.timerEvent) this.timerEvent.paused = false;
      this.startLevelTimer();
      this.resetHintTimer();
    });
  }

  private showLevelCompleteOverlay(bonus: number) {
    const { width, height } = this.layout;
    const overlay = this.add.rectangle(0, 0, width, height, 0x02070b, 0.78)
      .setOrigin(0)
      .setDepth(230);

    const panelW = Math.min(width - 36, 410);
    const panelH = 310;
    const panel = this.add.graphics().setDepth(231);
    panel.fillStyle(0x0a1824, 0.98);
    panel.fillRoundedRect(width / 2 - panelW / 2, height / 2 - panelH / 2, panelW, panelH, 26);
    panel.lineStyle(2, 0x62f0b1, 0.85);
    panel.strokeRoundedRect(width / 2 - panelW / 2, height / 2 - panelH / 2, panelW, panelH, 26);

    const title = this.add.text(width / 2, height / 2 - 100, "LEVEL CLEARED!", {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: `${Math.min(30, width * 0.065)}px`,
      color: "#62f0b1",
    }).setOrigin(0.5).setDepth(232);

    const stats = this.add.text(width / 2, height / 2 - 35,
      `TIME BONUS  +${Math.floor(this.timeLeft * 5).toLocaleString()}\nMOVE BONUS  +${Math.floor((this.moves * 15)).toLocaleString()}\nTOTAL BONUS  +${bonus.toLocaleString()}`,
      {
        fontFamily: "Arial, sans-serif",
        fontSize: `${Math.min(16, width * 0.038)}px`,
        color: "#d7e8ef",
        align: "center",
        lineSpacing: 8,
      }
    ).setOrigin(0.5).setDepth(232);

    const button = this.add.rectangle(width / 2, height / 2 + 94, Math.min(panelW - 50, 250), 56, 0x18a6a0, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(232);

    const buttonText = this.add.text(width / 2, height / 2 + 94, `NEXT LEVEL â€¢ ${this.level + 1}`, {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: `${Math.min(17, width * 0.041)}px`,
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(233);

    [title, stats, button, buttonText].forEach((obj) => {
      obj.setAlpha(0);
      obj.setScale(0.8);
    });

    this.tweens.add({
      targets: [title, stats, button, buttonText],
      alpha: 1,
      scale: 1,
      duration: 420,
      ease: "Back.Out",
    });

    button.on("pointerup", () => {
      overlay.destroy();
      panel.destroy();
      title.destroy();
      stats.destroy();
      button.destroy();
      buttonText.destroy();
      this.continueToNextLevel();
    });
  }

  private showIntroScreen() {
    const { width, height, portrait } = this.layout;

    this.gameStarted = false;
    this.busy = true;

    const overlay = this.add.rectangle(0, 0, width, height, 0x35124f, 0.62).setOrigin(0).setDepth(300);
    const panelW = Math.min(width - 28, 430);
    const panelH = portrait ? Math.min(height - 36, 500) : 420;
    const px = width / 2 - panelW / 2;
    const py = height / 2 - panelH / 2;

    const panel = this.add.graphics().setDepth(301);
    panel.fillStyle(0xfff8fc, 0.98);
    panel.fillRoundedRect(px, py, panelW, panelH, 32);
    panel.lineStyle(5, 0xff8bc7, 0.95);
    panel.strokeRoundedRect(px, py, panelW, panelH, 32);
    panel.lineStyle(2, 0xffd8ed, 0.95);
    panel.strokeRoundedRect(px + 8, py + 8, panelW - 16, panelH - 16, 25);

    const top = this.add.graphics().setDepth(302);
    top.fillStyle(0xff79b9, 0.96);
    top.fillRoundedRect(px + 7, py + 7, panelW - 14, 78, 25);
    top.fillStyle(0xffffff, 0.18);
    top.fillRoundedRect(px + 18, py + 16, panelW - 36, 15, 8);

    const title = this.add.text(width / 2, py + 47, `LEVEL ${this.level}`, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontStyle: "bold",
      fontSize: `${Math.min(30, width * 0.065)}px`, color: "#ffffff",
      stroke: "#a63c79", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(303);

    const objective = this.add.text(width / 2, py + 113, this.getObjectiveLabel().replace("MISSION â€¢ ", ""), {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontStyle: "bold",
      fontSize: `${Math.min(21, width * 0.047)}px`, color: "#873b74",
      align: "center", wordWrap: { width: panelW - 54 },
    }).setOrigin(0.5).setDepth(303);

    const info = this.add.text(width / 2, py + 163, `â™¥ ${this.lives}     â± ${this.formatTime(this.getLevelConfig().time)}     âœ¦ ${this.getLevelConfig().moves} MOVES`, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontStyle: "bold",
      fontSize: `${Math.min(13, width * 0.029)}px`, color: "#a85b87",
    }).setOrigin(0.5).setDepth(303);
    const buttonY = py + panelH - 52;
    const button = this.add.rectangle(width / 2, buttonY, Math.min(panelW - 54, 300), 56, 0xff4f9e, 1).setDepth(305).setInteractive({ useHandCursor: true });
    button.setStrokeStyle(3, 0xffd8ee, 0.95);
    const buttonText = this.add.text(width / 2, buttonY, "PLAY!", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontStyle: "bold", fontSize: `${Math.min(22, width * 0.05)}px`, color: "#ffffff",
      stroke: "#a93677", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(306);

    const introObjects = [overlay, panel, top, title, objective, info, button, buttonText];
    introObjects.forEach((obj) => obj.setAlpha(0));
    gsap.to(introObjects, { alpha: 1, duration: 0.45, stagger: 0.035, ease: "power2.out" });
    gsap.to(button, { scale: 1.04, duration: 0.8, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 0.7 });

    button.on("pointerup", () => {
      this.ensureAudio();
      this.gameStarted = true;
      this.busy = false;
      gsap.killTweensOf(introObjects);
      gsap.killTweensOf(button);
      gsap.to(introObjects, { alpha: 0, scale: 0.96, duration: 0.28, stagger: 0.012, ease: "power2.in", onComplete: () => introObjects.forEach((obj) => obj.destroy()) });

      const config = this.getLevelConfig();
      this.moves = config.moves;
      this.timeLeft = config.time;
      this.updateHud();
      this.startLevelTimer();
      this.resetHintTimer();

      const pulse = this.add.text(width / 2, this.layout.boardY - 18, "LET'S PLAY!", {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontStyle: "bold", fontSize: `${Math.min(27, width * 0.058)}px`,
        color: "#ff4f9e", stroke: "#ffffff", strokeThickness: 7,
      }).setOrigin(0.5).setDepth(80).setAlpha(0).setScale(0.7);
      gsap.to(pulse, { alpha: 1, scale: 1, duration: 0.3, ease: "back.out(1.8)", onComplete: () => gsap.to(pulse, { alpha: 0, y: pulse.y - 15, duration: 0.5, delay: 0.35, onComplete: () => pulse.destroy() }) });
    });
  }

  private showEndScreen(won: boolean) {
    this.busy = true;

    if (won) {
      this.playTone(523.25, 0.18, 0.05, "triangle");
      this.time.delayedCall(110, () => this.playTone(659.25, 0.18, 0.05, "triangle"));
      this.time.delayedCall(220, () => this.playTone(783.99, 0.28, 0.06, "sine"));
    } else {
      this.playTone(180, 0.25, 0.04, "sawtooth");
    }

    const { width, height, portrait } = this.layout;

    const overlay = this.add.rectangle(0, 0, width, height, 0x010409, 0.84)
      .setOrigin(0)
      .setDepth(200);

    const panelWidth = Math.min(width - 28, portrait ? 410 : 460);
    const panelHeight = portrait ? 360 : 330;
    const panelX = width / 2 - panelWidth / 2;
    const panelY = height / 2 - panelHeight / 2;

    const panel = this.add.graphics().setDepth(201);
    panel.fillStyle(0x06141e, 0.99);
    panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 28);
    panel.lineStyle(2, won ? 0x55edb4 : 0xff6485, 0.82);
    panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 28);
    panel.lineStyle(1, 0xffffff, 0.08);
    panel.strokeRoundedRect(panelX + 7, panelY + 7, panelWidth - 14, panelHeight - 14, 22);

    const tag = this.add.text(width / 2, panelY + 34, won ? "MISSION COMPLETE" : "MISSION FAILED", {
      fontFamily: "Trebuchet MS, Arial, sans-serif",
      fontSize: "10px",
      fontStyle: "bold",
      color: won ? "#61e9b2" : "#ff6d8b",
      letterSpacing: 3,
    }).setOrigin(0.5).setDepth(202);

    const title = this.add.text(width / 2, panelY + 72, won ? "MAZE CLEARED" : "RUN OVER", {
      fontFamily: "Trebuchet MS, Arial, sans-serif",
      fontSize: `${Math.min(36, width * 0.078)}px`,
      fontStyle: "bold",
      color: "#f5ffff",
      stroke: "#02080e",
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(202);

    const score = this.add.text(width / 2, panelY + 125, this.score.toLocaleString(), {
      fontFamily: "Trebuchet MS, Arial, sans-serif",
      fontSize: `${Math.min(42, width * 0.09)}px`,
      fontStyle: "bold",
      color: won ? "#ffe06b" : "#ffffff",
    }).setOrigin(0.5).setDepth(202);

    const scoreLabel = this.add.text(width / 2, panelY + 155, "FINAL SCORE", {
      fontFamily: "Trebuchet MS, Arial, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      color: "#7995a3",
      letterSpacing: 3,
    }).setOrigin(0.5).setDepth(202);

    const detail = this.add.text(
      width / 2,
      panelY + 192,
      `LEVEL ${this.level.toString().padStart(2, "0")}   â€¢   BEST COMBO Ã—${this.bestCombo}`,
      {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: `${Math.min(11, width * 0.027)}px`,
        fontStyle: "bold",
        color: "#a5bbc5",
        letterSpacing: 1,
      }
    ).setOrigin(0.5).setDepth(202);

    const buttonWidth = Math.min(panelWidth - 46, 300);
    const buttonY = panelY + panelHeight - 55;

    const button = this.add.rectangle(
      width / 2,
      buttonY,
      buttonWidth,
      56,
      won ? 0x18a79f : 0x253743,
      1
    ).setInteractive({ useHandCursor: true }).setDepth(202);

    button.setStrokeStyle(2, won ? 0x8bfff3 : 0x718894, 0.72);

    const buttonText = this.add.text(width / 2, buttonY, won ? "CONTINUE HUNT" : "RESTART HUNT", {
      fontFamily: "Trebuchet MS, Arial, sans-serif",
      fontSize: `${Math.min(16, width * 0.038)}px`,
      fontStyle: "bold",
      color: "#ffffff",
      letterSpacing: 1,
    }).setOrigin(0.5).setDepth(203);

    const objects = [overlay, panel, tag, title, score, scoreLabel, detail, button, buttonText];
    objects.forEach((obj) => {
      obj.setAlpha(0);
      obj.setScale(0.88);
    });

    gsap.to(objects, {
      alpha: 1,
      scale: 1,
      duration: 0.55,
      stagger: 0.035,
      ease: "back.out(1.4)",
    });

    button.on("pointerup", () => {
      gsap.killTweensOf(objects);
      this.scene.restart();
    });
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,

  width: window.innerWidth,
  height: window.innerHeight,

  parent: "game",

  backgroundColor: "#06111b",

  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
    expandParent: true,
  },

  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: "high-performance",
  },

  input: {
    activePointers: 4,
    touch: {
      capture: true,
    },
  },

  fps: {
    target: 60,
    forceSetTimeOut: false,
  },

  disableContextMenu: true,

  scene: [MazeHunter],
};

new Phaser.Game(config);















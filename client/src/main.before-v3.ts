import Phaser from "phaser";

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

const CANDIES: Array<{
  color: number;
  dark: number;
  glow: number;
  symbol: string;
}> = [
  { color: 0x43d98b, dark: 0x167a53, glow: 0x8fffc2, symbol: "◆" },
  { color: 0xff4f73, dark: 0x9c2347, glow: 0xffa1b6, symbol: "◇" },
  { color: 0xffc936, dark: 0x9b6b08, glow: 0xffee8a, symbol: "★" },
  { color: 0x5ba8ff, dark: 0x1c579c, glow: 0x9bd0ff, symbol: "●" },
  { color: 0xa66cff, dark: 0x57339c, glow: 0xd2b5ff, symbol: "●" },
  { color: 0xff7b38, dark: 0x9c4217, glow: 0xffbd91, symbol: "★" },
];

class MazeHunter extends Phaser.Scene {
  private board: Array<Array<PieceType | null>> = [];
  private pieces: Array<Array<Piece | null>> = [];

  private selected: { row: number; col: number } | null = null;
  private busy = false;

  private score = 0;
  private moves = 30;
  private combo = 0;

  private layout!: Layout;

  private boardFrame!: Phaser.GameObjects.Graphics;
  private background!: Phaser.GameObjects.Graphics;

  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;

  private scoreLabel!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;

  private movesLabel!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;

  private objectiveText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

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


  constructor() {
    super("MazeHunter");
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
    this.resetHintTimer();
  }

  shutdown() {
    if (this.resizeHandler) {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeHandler);
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
        height - boardSize - 28,
        Math.max(170, height * 0.34)
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
    this.background = this.add.graphics();
    this.background.setDepth(-100);
  }

  private drawBackground() {
    const { width, height } = this.layout;

    this.background.clear();

    this.background.fillStyle(0x06111b, 1);
    this.background.fillRect(0, 0, width, height);

    this.background.fillStyle(0x0a1c29, 1);
    this.background.fillCircle(width * 0.12, height * 0.2, Math.min(width, height) * 0.35);

    this.background.fillStyle(0x101a3a, 0.8);
    this.background.fillCircle(width * 0.88, height * 0.72, Math.min(width, height) * 0.34);

    this.background.fillStyle(0x092333, 0.8);
    this.background.fillCircle(width * 0.5, height * 0.5, Math.min(width, height) * 0.5);

    this.background.lineStyle(1, 0x173447, 0.22);

    const grid = Math.max(32, this.layout.cell * 0.75);

    for (let x = 0; x <= width; x += grid) {
      this.background.lineBetween(x, 0, x, height);
    }

    for (let y = 0; y <= height; y += grid) {
      this.background.lineBetween(0, y, width, y);
    }
  }

  private createHud() {
    this.titleText = this.add
      .text(0, 0, "MAZE HUNTER", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "40px",
        color: "#f7fbff",
        stroke: "#07121c",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    this.subtitleText = this.add
      .text(0, 0, "CRYSTAL MAZE", {
        fontFamily: "Arial, sans-serif",
        fontSize: "15px",
        color: "#6ee7d8",
        letterSpacing: 4,
      })
      .setOrigin(0.5);

    this.scoreLabel = this.add
      .text(0, 0, "SCORE", {
        fontFamily: "Arial, sans-serif",
        fontSize: "12px",
        color: "#78909c",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.scoreText = this.add
      .text(0, 0, "000000", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "30px",
        color: "#f7fbff",
      })
      .setOrigin(0.5);

    this.movesLabel = this.add
      .text(0, 0, "MOVES", {
        fontFamily: "Arial, sans-serif",
        fontSize: "12px",
        color: "#78909c",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.movesText = this.add
      .text(0, 0, "30", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "30px",
        color: "#f7fbff",
      })
      .setOrigin(0.5);

    this.objectiveText = this.add
      .text(0, 0, "REACH 2,500 POINTS • BUILD COMBOS", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "15px",
        color: "#ffd84d",
        stroke: "#07121c",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.comboText = this.add
      .text(0, 0, "", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "24px",
        color: "#ffffff",
        stroke: "#07121c",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setAlpha(0);
  }

  private relayout() {
    this.layout = this.calculateLayout();

    this.drawBackground();
    this.layoutHud();
    this.layoutBoard();
  }

  private layoutHud() {
    const {
      width,
      height,
      portrait,
      hudTop,
      titleSize,
      subtitleSize,
      statSize,
      smallSize,
    } = this.layout;

    this.titleText
      .setPosition(width / 2, hudTop + titleSize * 0.48)
      .setFontSize(titleSize);

    this.subtitleText
      .setPosition(width / 2, hudTop + titleSize + 7)
      .setFontSize(subtitleSize);

    if (portrait) {
      const statY = hudTop + titleSize + 58;
      const side = Math.min(width * 0.22, 105);

      this.scoreLabel
        .setPosition(side, statY)
        .setFontSize(smallSize);

      this.scoreText
        .setPosition(side, statY + statSize * 0.7)
        .setFontSize(statSize);

      this.movesLabel
        .setPosition(width - side, statY)
        .setFontSize(smallSize);

      this.movesText
        .setPosition(width - side, statY + statSize * 0.7)
        .setFontSize(statSize);

      this.objectiveText
        .setPosition(width / 2, statY + statSize + 32)
        .setFontSize(Math.max(12, smallSize + 2));

      this.comboText.setPosition(width / 2, height * 0.93);
    } else {
      this.scoreLabel
        .setPosition(width * 0.18, height * 0.14)
        .setFontSize(smallSize);

      this.scoreText
        .setPosition(width * 0.18, height * 0.14 + statSize * 0.7)
        .setFontSize(statSize);

      this.movesLabel
        .setPosition(width * 0.36, height * 0.14)
        .setFontSize(smallSize);

      this.movesText
        .setPosition(width * 0.36, height * 0.14 + statSize * 0.7)
        .setFontSize(statSize);

      this.objectiveText
        .setPosition(width * 0.27, height * 0.25)
        .setFontSize(Math.max(12, smallSize + 2));

      this.comboText.setPosition(width * 0.27, height * 0.88);
    }
  }

  private layoutBoard() {
    if (!this.boardFrame) {
      this.boardFrame = this.add.graphics();
    }

    const { boardX, boardY, boardSize, cell } = this.layout;

    this.boardFrame.clear();

    const outer = 12;
    const radius = Math.max(16, cell * 0.28);

    this.boardFrame.fillStyle(0x000000, 0.32);
    this.boardFrame.fillRoundedRect(
      boardX - outer + 5,
      boardY - outer + 8,
      boardSize + outer * 2,
      boardSize + outer * 2,
      radius
    );

    this.boardFrame.fillStyle(0x07141f, 0.98);
    this.boardFrame.fillRoundedRect(
      boardX - outer,
      boardY - outer,
      boardSize + outer * 2,
      boardSize + outer * 2,
      radius
    );

    this.boardFrame.lineStyle(2, 0x1e7180, 0.9);
    this.boardFrame.strokeRoundedRect(
      boardX - outer,
      boardY - outer,
      boardSize + outer * 2,
      boardSize + outer * 2,
      radius
    );

    this.boardFrame.lineStyle(1, 0x3bb8ba, 0.28);
    this.boardFrame.strokeRoundedRect(
      boardX - outer + 6,
      boardY - outer + 6,
      boardSize + outer * 2 - 12,
      boardSize + outer * 2 - 12,
      radius - 4
    );

    this.boardFrame.fillStyle(0x0c2531, 0.88);
    this.boardFrame.fillRoundedRect(
      boardX,
      boardY,
      boardSize,
      boardSize,
      Math.max(8, cell * 0.12)
    );

    this.boardFrame.lineStyle(1, 0x234653, 0.45);

    for (let r = 1; r < ROWS; r++) {
      const y = boardY + r * cell;
      this.boardFrame.lineBetween(boardX, y, boardX + boardSize, y);
    }

    for (let c = 1; c < COLS; c++) {
      const x = boardX + c * cell;
      this.boardFrame.lineBetween(x, boardY, x, boardY + boardSize);
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
      container.setScale(0.2);
      container.setAlpha(0);

      this.tweens.add({
        targets: container,
        scale: 1,
        alpha: 1,
        duration: 260,
        delay: row * 30,
        ease: "Back.Out",
      });
    }

    this.addCandyIdleAnimation(container);

    return piece;
  }

  private drawCandy(
    container: Phaser.GameObjects.Container,
    data: (typeof CANDIES)[number],
    special?: Piece["special"]
  ) {
    const cell = this.layout?.cell ?? 60;
    const radius = cell * 0.34;

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillCircle(3, 5, radius * 1.04);

    const aura = this.add.graphics();
    aura.fillStyle(data.glow, 0.12);
    aura.fillCircle(0, 0, radius * 1.28);

    const shell = this.add.graphics();
    shell.fillStyle(data.dark, 1);
    shell.fillCircle(0, 2, radius * 1.05);

    const candy = this.add.graphics();
    candy.fillStyle(data.color, 1);
    candy.fillCircle(0, 0, radius);

    candy.fillStyle(data.glow, 0.34);
    candy.fillEllipse(
      -radius * 0.18,
      -radius * 0.34,
      radius * 1.05,
      radius * 0.48
    );

    candy.fillStyle(0xffffff, 0.68);
    candy.fillCircle(-radius * 0.31, -radius * 0.34, radius * 0.12);

    candy.fillStyle(data.dark, 0.3);
    candy.fillEllipse(
      radius * 0.08,
      radius * 0.43,
      radius * 1.25,
      radius * 0.28
    );

    candy.lineStyle(Math.max(1.5, cell * 0.025), 0xffffff, 0.18);
    candy.strokeCircle(0, 0, radius);

    const icon = this.add
      .text(0, radius * 0.04, data.symbol, {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: `${Math.max(13, cell * 0.28)}px`,
        color: "#ffffff",
        stroke: "#ffffff",
        strokeThickness: Math.max(1, cell * 0.018),
      })
      .setOrigin(0.5)
      .setAlpha(0.9);

    container.add([
      shadow,
      aura,
      shell,
      candy,
      icon,
    ]);

    if (special) {
      this.addSpecialVisual(container, special, cell);
    }
  }

  private addSpecialVisual(
    container: Phaser.GameObjects.Container,
    special: Piece["special"],
    cell: number
  ) {
    if (!special) return;

    const visual = this.add.graphics();

    if (special === "line-h") {
      visual.lineStyle(
        Math.max(3, cell * 0.065),
        0xffffff,
        0.95
      );

      visual.lineBetween(
        -cell * 0.29,
        0,
        cell * 0.29,
        0
      );

      visual.lineStyle(
        Math.max(1, cell * 0.025),
        0x7affdf,
        0.9
      );

      visual.lineBetween(
        -cell * 0.29,
        -cell * 0.06,
        cell * 0.29,
        -cell * 0.06
      );
    }

    if (special === "line-v") {
      visual.lineStyle(
        Math.max(3, cell * 0.065),
        0xffffff,
        0.95
      );

      visual.lineBetween(
        0,
        -cell * 0.29,
        0,
        cell * 0.29
      );

      visual.lineStyle(
        Math.max(1, cell * 0.025),
        0x7affdf,
        0.9
      );

      visual.lineBetween(
        -cell * 0.06,
        -cell * 0.29,
        -cell * 0.06,
        cell * 0.29
      );
    }

    if (special === "bomb") {
      visual.lineStyle(
        Math.max(2, cell * 0.04),
        0xffdf70,
        0.95
      );

      visual.strokeCircle(
        0,
        0,
        cell * 0.38
      );

      visual.fillStyle(0xffffff, 0.95);
      visual.fillCircle(
        cell * 0.21,
        -cell * 0.22,
        Math.max(2, cell * 0.045)
      );

      visual.fillCircle(
        -cell * 0.2,
        cell * 0.2,
        Math.max(1.5, cell * 0.03)
      );
    }

    if (special === "rainbow") {
      visual.lineStyle(
        Math.max(3, cell * 0.045),
        0xffffff,
        0.95
      );

      visual.strokeCircle(
        0,
        0,
        cell * 0.39
      );

      visual.lineStyle(
        Math.max(2, cell * 0.025),
        0x7affdf,
        0.8
      );

      visual.strokeCircle(
        0,
        0,
        cell * 0.31
      );

      const sparkle = this.add.text(
        0,
        0,
        "✦",
        {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: `${Math.max(15, cell * 0.38)}px`,
          color: "#ffffff",
        }
      ).setOrigin(0.5);

      container.add(sparkle);

      this.tweens.add({
        targets: sparkle,
        angle: 360,
        duration: 1400,
        repeat: -1,
        ease: "Linear",
      });
    }

    container.add(visual);

    this.tweens.add({
      targets: visual,
      alpha: 0.42,
      scale: 1.08,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  private addCandyIdleAnimation(container: Phaser.GameObjects.Container) {
    this.tweens.add({
      targets: container,
      scaleX: 1.025,
      scaleY: 0.985,
      duration: 1150 + Phaser.Math.Between(0, 350),
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  private setupInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.busy || !pointer.isDown) return;

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

    if (!cell || this.busy || this.moves <= 0) return;

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
      scale: 1.14,
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
    if (this.busy || this.moves <= 0) return;

    const first = this.pieces[r1][c1];
    const second = this.pieces[r2][c2];

    if (!first || !second) return;

    this.busy = true;
    this.clearHint();


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

              this.busy = false;
              this.resetHintTimer();
            },
          });

          return;
        }

        this.moves--;
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

      if (this.score >= 2500) {
        this.showEndScreen(true);
      } else if (this.moves <= 0) {
        this.showEndScreen(false);
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
      Math.min(this.combo, 5);

    const points =
      expanded.size *
      100 *
      multiplier;

    this.score += points;

    this.updateHud();
    this.showCombo();

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
            scale: 1.28,
            duration: 160,
            ease: "Back.Out",
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
          scale: 1.18,
          duration: 80,
          delay,
          ease: "Quad.Out",
          onComplete: () => {
            this.tweens.add({
              targets: piece.container,
              scale: 1.5,
              angle:
                Phaser.Math.Between(
                  -20,
                  20
                ),
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
        let r = row - 1;
        r <= row + 1;
        r++
      ) {
        for (
          let c = col - 1;
          c <= col + 1;
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

    if (
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
      (175 + Math.min(this.combo, 5) * 35);

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
          scale: 1.65,
          angle:
            Phaser.Math.Between(
              -30,
              30
            ),
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

    this.time.delayedCall(650, () => {
      const matches = this.findMatches();

      if (matches.length > 0) {
        this.showCallout(
          this.combo >= 3
            ? `CASCADE ×${this.combo}`
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
        this.busy = false;

        if (this.score >= 2500) {
          this.showEndScreen(true);
        } else if (this.moves <= 0) {
          this.showEndScreen(false);
        }
      }
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
        this.layout.boardY - this.layout.cell * 0.45,
        message,
        {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: `${Math.max(17, this.layout.width * 0.05)}px`,
          color: "#ffffff",
          stroke: "#07121c",
          strokeThickness: 7,
        }
      )
      .setOrigin(0.5)
      .setDepth(85)
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
    const { boardX, boardY, cell } =
      this.layout;

    const x =
      boardX +
      col * cell +
      cell / 2;

    const y =
      boardY +
      row * cell +
      cell / 2;

    const ring = this.add.graphics();

    const ringColor =
      special === "rainbow"
        ? 0xffffff
        : special === "bomb"
          ? 0xffd34d
          : 0x7affdf;

    ring.lineStyle(
      Math.max(2, cell * 0.04),
      ringColor,
      0.9
    );

    ring.strokeCircle(
      x,
      y,
      cell * 0.25
    );

    ring.setDepth(45);
    ring.setScale(0.35);

    this.tweens.add({
      targets: ring,
      scale: 1.7,
      alpha: 0,
      duration: 420,
      ease: "Cubic.Out",
      onComplete: () =>
        ring.destroy(),
    });

    for (let i = 0; i < 8; i++) {
      const spark = this.add.circle(
        x,
        y,
        Math.max(1.5, cell * 0.028),
        ringColor,
        0.95
      );

      spark.setDepth(46);

      const angle =
        (Math.PI * 2 * i) / 8;

      this.tweens.add({
        targets: spark,
        x:
          x +
          Math.cos(angle) *
            cell *
            0.75,
        y:
          y +
          Math.sin(angle) *
            cell *
            0.75,
        alpha: 0,
        scale: 0.15,
        duration: 360,
        ease: "Cubic.Out",
        onComplete: () =>
          spark.destroy(),
      });
    }
  }

  private createComboShockwave() {
    const { width, height } =
      this.layout;

    const ring = this.add.graphics();

    ring.lineStyle(
      Math.max(2, width * 0.004),
      0x7affdf,
      0.35
    );

    ring.strokeCircle(
      width / 2,
      height * 0.5,
      Math.min(width, height) * 0.08
    );

    ring.setDepth(75);

    this.tweens.add({
      targets: ring,
      scale: 4,
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
        0x7affdf,
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
      "↔",
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
    this.comboText.setText(
      this.combo > 1
        ? `COMBO ×${this.combo}`
        : ""
    );

    if (this.combo <= 1) return;

    this.comboText.setAlpha(1);
    this.comboText.setScale(0.45);

    this.tweens.killTweensOf(this.comboText);

    this.tweens.add({
      targets: this.comboText,
      scale: 1.12,
      duration: 180,
      ease: "Back.Out",
      onComplete: () => {
        this.tweens.add({
          targets: this.comboText,
          scale: 1,
          duration: 180,
          ease: "Quad.Out",
        });
      },
    });

    this.comboText.setColor(
      this.combo >= 5
        ? "#ffcf4d"
        : this.combo >= 3
          ? "#7affdf"
          : "#ffffff"
    );
  }

  private updateHud() {
    this.scoreText.setText(
      this.score.toString().padStart(6, "0")
    );

    this.movesText.setText(this.moves.toString());
  }

  private showEndScreen(won: boolean) {
    this.busy = true;

    if (won) {
      this.playTone(523.25, 0.18, 0.05, "triangle");
      this.time.delayedCall(110, () =>
        this.playTone(659.25, 0.18, 0.05, "triangle")
      );
      this.time.delayedCall(220, () =>
        this.playTone(783.99, 0.28, 0.06, "sine")
      );
    } else {
      this.playTone(180, 0.25, 0.04, "sawtooth");
    }

    const { width, height, portrait } = this.layout;

    this.add
      .rectangle(0, 0, width, height, 0x02070b, 0.78)
      .setOrigin(0)
      .setDepth(200);

    const panelWidth = Math.min(width - 32, portrait ? 390 : 430);
    const panelHeight = portrait ? 270 : 300;
    const panelX = width / 2 - panelWidth / 2;
    const panelY = height / 2 - panelHeight / 2;

    const panel = this.add.graphics().setDepth(201);

    panel.fillStyle(0x0a1824, 0.98);
    panel.fillRoundedRect(
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      24
    );

    panel.lineStyle(2, won ? 0x4be3a1 : 0xff6685, 0.85);
    panel.strokeRoundedRect(
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      24
    );

    this.add
      .text(
        width / 2,
        panelY + 58,
        won ? "MAZE CLEARED!" : "OUT OF MOVES",
        {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: `${Math.min(34, width * 0.075)}px`,
          color: won ? "#62f0b1" : "#ff708b",
        }
      )
      .setOrigin(0.5)
      .setDepth(202);

    this.add
      .text(
        width / 2,
        panelY + 108,
        `FINAL SCORE  ${this.score.toLocaleString()}`,
        {
          fontFamily: "Arial, sans-serif",
          fontSize: `${Math.min(18, width * 0.042)}px`,
          color: "#d7e8ef",
          fontStyle: "bold",
        }
      )
      .setOrigin(0.5)
      .setDepth(202);

    const buttonWidth = Math.min(panelWidth - 50, 250);
    const buttonHeight = 58;
    const buttonY = panelY + panelHeight - 82;

    const button = this.add
      .rectangle(
        width / 2,
        buttonY + buttonHeight / 2,
        buttonWidth,
        buttonHeight,
        0x18a6a0,
        1
      )
      .setInteractive({ useHandCursor: true })
      .setDepth(202);

    button.setStrokeStyle(2, 0x75fff0, 0.7);

    this.add
      .text(width / 2, buttonY + buttonHeight / 2, "PLAY AGAIN", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: `${Math.min(19, width * 0.045)}px`,
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(203);

    button.on("pointerup", () => {
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












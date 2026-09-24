import Phaser from "phaser";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 720;

const COLS = 8;
const ROWS = 8;
const CELL = 68;

const BOARD_X =
  (GAME_WIDTH - COLS * CELL) / 2;

const BOARD_Y = 154;

const TYPES = [
  {
    color: 0xff4f73,
    dark: 0xc92d51,
    glow: 0xff8ca1,
    symbol: "◆"
  },
  {
    color: 0x45a7ff,
    dark: 0x2872c7,
    glow: 0x8bceff,
    symbol: "●"
  },
  {
    color: 0xffc83d,
    dark: 0xd39416,
    glow: 0xffe58b,
    symbol: "★"
  },
  {
    color: 0x58d68d,
    dark: 0x299d60,
    glow: 0x9af0bd,
    symbol: "◆"
  },
  {
    color: 0xb56cff,
    dark: 0x7138b7,
    glow: 0xd7b2ff,
    symbol: "●"
  },
  {
    color: 0xff8b42,
    dark: 0xd45a20,
    glow: 0xffc08e,
    symbol: "★"
  }
];

type Piece = {
  type: number;
  container: Phaser.GameObjects.Container;
  special?: "row" | "column" | "bomb";
};

class MazeHunter extends Phaser.Scene {
  private board: (Piece | null)[][] = [];

  private selected:
    { row: number; col: number } | null = null;

  private busy = false;

  private score = 0;
  private moves = 30;
  private combo = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;

  private boardGlow!: Phaser.GameObjects.Graphics;

  constructor() {
    super("MazeHunter");
  }

  create() {
    this.createBackground();
    this.createHUD();
    this.createBoardFrame();

    this.generateBoard();
    this.renderBoard();

    this.input.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer) => {
        this.handleBoardInput(pointer);
      }
    );
  }

  // ==========================================================
  // BACKGROUND
  // ==========================================================

  private createBackground() {
    const bg =
      this.add.graphics();

    bg.fillGradientStyle(
      0x07121c,
      0x07121c,
      0x10263b,
      0x10263b,
      1
    );

    bg.fillRect(
      0,
      0,
      GAME_WIDTH,
      GAME_HEIGHT
    );

    // Soft decorative circles.
    const glow =
      this.add.graphics();

    glow.fillStyle(
      0x1c5c72,
      0.14
    );

    glow.fillCircle(
      120,
      180,
      190
    );

    glow.fillStyle(
      0x703d9e,
      0.12
    );

    glow.fillCircle(
      850,
      560,
      240
    );

    // Subtle grid.
    const grid =
      this.add.graphics();

    grid.lineStyle(
      1,
      0xffffff,
      0.025
    );

    for (
      let x = 0;
      x < GAME_WIDTH;
      x += 40
    ) {
      grid.lineBetween(
        x,
        0,
        x,
        GAME_HEIGHT
      );
    }

    for (
      let y = 0;
      y < GAME_HEIGHT;
      y += 40
    ) {
      grid.lineBetween(
        0,
        y,
        GAME_WIDTH,
        y
      );
    }
  }

  // ==========================================================
  // HUD
  // ==========================================================

  private createHUD() {
    this.add.text(
      38,
      26,
      "MAZE HUNTER",
      {
        fontFamily: "Arial Black, Arial",
        fontSize: "28px",
        color: "#ffffff",
        letterSpacing: 3
      }
    );

    this.add.text(
      40,
      61,
      "CRYSTAL MAZE",
      {
        fontFamily: "Arial",
        fontSize: "12px",
        color: "#69e6c3",
        fontStyle: "bold",
        letterSpacing: 3
      }
    );

    // Score panel.
    this.add
      .rectangle(
        790,
        22,
        132,
        66,
        0x0b1823,
        0.94
      )
      .setStrokeStyle(
        1,
        0x54d6b5,
        0.35
      );

    this.add.text(
      806,
      32,
      "SCORE",
      {
        fontFamily: "Arial",
        fontSize: "10px",
        color: "#7b929f",
        fontStyle: "bold"
      }
    );

    this.scoreText =
      this.add.text(
        806,
        49,
        "000000",
        {
          fontFamily:
            "Arial Black, Arial",
          fontSize: "22px",
          color: "#ffffff"
        }
      );

    // Moves panel.
    this.add
      .rectangle(
        40,
        100,
        150,
        42,
        0x0b1823,
        0.92
      )
      .setStrokeStyle(
        1,
        0xffffff,
        0.08
      );

    this.add.text(
      54,
      114,
      "MOVES",
      {
        fontFamily: "Arial",
        fontSize: "11px",
        color: "#8095a1",
        fontStyle: "bold"
      }
    );

    this.movesText =
      this.add.text(
        130,
        109,
        "30",
        {
          fontFamily:
            "Arial Black, Arial",
          fontSize: "20px",
          color: "#ffffff"
        }
      );

    // Objective.
    this.add.text(
      225,
      108,
      "OBJECTIVE",
      {
        fontFamily: "Arial",
        fontSize: "10px",
        color: "#718895",
        fontStyle: "bold"
      }
    );

    this.objectiveText =
      this.add.text(
        225,
        122,
        "REACH 2,500 POINTS",
        {
          fontFamily:
            "Arial Black, Arial",
          fontSize: "13px",
          color: "#ffe38a"
        }
      );

    this.comboText =
      this.add.text(
        GAME_WIDTH / 2,
        105,
        "",
        {
          fontFamily:
            "Arial Black, Arial",
          fontSize: "18px",
          color: "#ffffff"
        }
      )
      .setOrigin(0.5);

    this.updateHUD();
  }

  // ==========================================================
  // BOARD FRAME
  // ==========================================================

  private createBoardFrame() {
    const width =
      COLS * CELL + 42;

    const height =
      ROWS * CELL + 42;

    // Outer atmospheric glow.
    const outerGlow =
      this.add.graphics();

    outerGlow.fillStyle(
      0x37d6b0,
      0.045
    );

    outerGlow.fillRoundedRect(
      BOARD_X - 31,
      BOARD_Y - 31,
      width + 28,
      height + 28,
      30
    );

    // Deep board shadow.
    const shadow =
      this.add.graphics();

    shadow.fillStyle(
      0x000000,
      0.42
    );

    shadow.fillRoundedRect(
      BOARD_X - 13,
      BOARD_Y - 5,
      width,
      height + 18,
      25
    );

    // Main raised board.
    this.boardGlow =
      this.add.graphics();

    this.boardGlow.fillStyle(
      0x081725,
      1
    );

    this.boardGlow.fillRoundedRect(
      BOARD_X - 21,
      BOARD_Y - 21,
      width,
      height,
      25
    );

    // Outer bevel.
    this.boardGlow.lineStyle(
      2,
      0x66ead0,
      0.32
    );

    this.boardGlow.strokeRoundedRect(
      BOARD_X - 21,
      BOARD_Y - 21,
      width,
      height,
      25
    );

    // Inner bevel.
    this.boardGlow.lineStyle(
      1,
      0xffffff,
      0.055
    );

    this.boardGlow.strokeRoundedRect(
      BOARD_X - 11,
      BOARD_Y - 11,
      COLS * CELL + 20,
      ROWS * CELL + 20,
      18
    );

    // Subtle top shine.
    const shine =
      this.add.graphics();

    shine.fillGradientStyle(
      0xffffff,
      0xffffff,
      0xffffff,
      0xffffff,
      0.045,
      0.045,
      0,
      0
    );

    shine.fillRoundedRect(
      BOARD_X - 15,
      BOARD_Y - 15,
      COLS * CELL + 30,
      42,
      17
    );

    // Cell separators.
    const cells =
      this.add.graphics();

    cells.lineStyle(
      1,
      0x8be9d7,
      0.035
    );

    for (
      let row = 0;
      row <= ROWS;
      row++
    ) {
      const y =
        BOARD_Y +
        row * CELL;

      cells.lineBetween(
        BOARD_X,
        y,
        BOARD_X +
          COLS * CELL,
        y
      );
    }

    for (
      let col = 0;
      col <= COLS;
      col++
    ) {
      const x =
        BOARD_X +
        col * CELL;

      cells.lineBetween(
        x,
        BOARD_Y,
        x,
        BOARD_Y +
          ROWS * CELL
      );
    }
  }

  // ==========================================================
  // BOARD GENERATION
  // ==========================================================

  private generateBoard() {
    this.board = [];

    for (
      let row = 0;
      row < ROWS;
      row++
    ) {
      this.board[row] = [];

      for (
        let col = 0;
        col < COLS;
        col++
      ) {
        let type = 0;

        do {
          type =
            Phaser.Math.Between(
              0,
              TYPES.length - 1
            );
        } while (
          (
            col >= 2 &&
            this.board[row][col - 1] &&
            this.board[row][col - 2] &&
            this.board[row][col - 1]!.type ===
              type &&
            this.board[row][col - 2]!.type ===
              type
          ) ||
          (
            row >= 2 &&
            this.board[row - 1][col] &&
            this.board[row - 2][col] &&
            this.board[row - 1][col]!.type ===
              type &&
            this.board[row - 2][col]!.type ===
              type
          )
        );

        this.board[row][col] =
          null;

        // Temporary type holder.
        this.board[row][col] =
          {
            type,
            container:
              null as unknown as Phaser.GameObjects.Container
          };
      }
    }
  }

  // ==========================================================
  // RENDER BOARD
  // ==========================================================

  private renderBoard() {
    for (
      let row = 0;
      row < ROWS;
      row++
    ) {
      for (
        let col = 0;
        col < COLS;
        col++
      ) {
        const piece =
          this.board[row][col];

        if (!piece) {
          continue;
        }

        const container =
          this.createPiece(
            piece.type,
            row,
            col
          );

        piece.container =
          container;

        this.board[row][col] =
          piece;
      }
    }
  }

  private createPiece(
    type: number,
    row: number,
    col: number
  ) {
    const data =
      TYPES[type];

    const x =
      BOARD_X +
      col * CELL +
      CELL / 2;

    const y =
      BOARD_Y +
      row * CELL +
      CELL / 2;

    const container =
      this.add.container(
        x,
        y
      );

    container.setSize(
      CELL - 6,
      CELL - 6
    );

    // Tile.
    const tile =
      this.add.graphics();

    tile.fillStyle(
      0x0d2230,
      1
    );

    tile.fillRoundedRect(
      -30,
      -30,
      60,
      60,
      16
    );

    tile.lineStyle(
      1,
      0x7de8d3,
      0.055
    );

    tile.strokeRoundedRect(
      -30,
      -30,
      60,
      60,
      16
    );

    container.add(tile);

    // Deep candy shadow.
    const shadow =
      this.add.ellipse(
        3,
        8,
        43,
        17,
        0x000000,
        0.38
      );

    container.add(shadow);

    // Soft glow behind candy.
    const aura =
      this.add.circle(
        0,
        0,
        27,
        data.color,
        0.08
      );

    container.add(aura);

    // Candy outer shell.
    const candy =
      this.add.graphics();

    candy.fillStyle(
      data.dark,
      1
    );

    candy.fillCircle(
      0,
      3,
      25
    );

    // Main candy.
    candy.fillStyle(
      data.color,
      1
    );

    candy.fillCircle(
      0,
      -1,
      23
    );

    // Upper light layer.
    candy.fillStyle(
      data.glow,
      0.52
    );

    candy.fillEllipse(
      -6,
      -11,
      18,
      9
    );

    // Strong specular highlight.
    candy.fillStyle(
      0xffffff,
      0.52
    );

    candy.fillEllipse(
      -10,
      -12,
      8,
      5
    );

    // Bottom depth.
    candy.fillStyle(
      0x000000,
      0.12
    );

    candy.fillEllipse(
      3,
      14,
      26,
      8
    );

    // Crisp outline.
    candy.lineStyle(
      1.5,
      data.glow,
      0.45
    );

    candy.strokeCircle(
      0,
      -1,
      23
    );

    container.add(candy);

    // Icon.
    const symbol =
      this.add.text(
        0,
        1,
        data.symbol,
        {
          fontFamily:
            "Arial Black, Arial",
          fontSize:
            type === 1 ||
            type === 4
              ? "20px"
              : "18px",
          color: "#ffffff",
          stroke: "#17303b",
          strokeThickness: 3,
          shadow: {
            offsetX: 0,
            offsetY: 2,
            color: "#000000",
            blur: 3,
            fill: true,
            stroke: false
          }
        }
      )
      .setOrigin(0.5);

    container.add(symbol);

    // Living candy glow.
    this.tweens.add({
      targets: aura,
      alpha: {
        from: 0.045,
        to: 0.13
      },
      scale: {
        from: 0.92,
        to: 1.08
      },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // Subtle candy shine.
    this.tweens.add({
      targets: candy,
      y: -1.5,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    container.setInteractive(
      new Phaser.Geom.Rectangle(
        -34,
        -34,
        68,
        68
      ),
      Phaser.Geom.Rectangle.Contains
    );

    container.on(
      "pointerover",
      () => {
        if (this.busy) {
          return;
        }

        this.tweens.add({
          targets:
            container,
          scale: 1.08,
          duration: 110,
          ease: "Back.easeOut"
        });
      }
    );

    container.on(
      "pointerout",
      () => {
        if (this.busy) {
          return;
        }

        this.tweens.add({
          targets:
            container,
          scale: 1,
          duration: 130,
          ease: "Quad.easeOut"
        });
      }
    );

    return container;
  }

  // ==========================================================
  // INPUT
  // ==========================================================

  private handleBoardInput(
    pointer: Phaser.Input.Pointer
  ) {
    if (this.busy) {
      return;
    }

    const col =
      Math.floor(
        (pointer.x - BOARD_X) /
          CELL
      );

    const row =
      Math.floor(
        (pointer.y - BOARD_Y) /
          CELL
      );

    if (
      row < 0 ||
      row >= ROWS ||
      col < 0 ||
      col >= COLS
    ) {
      return;
    }

    const piece =
      this.board[row][col];

    if (!piece) {
      return;
    }

    if (!this.selected) {
      this.selectPiece(
        row,
        col
      );

      return;
    }

    const dr =
      Math.abs(
        row -
          this.selected.row
      );

    const dc =
      Math.abs(
        col -
          this.selected.col
      );

    if (
      dr + dc !== 1
    ) {
      this.selectPiece(
        row,
        col
      );

      return;
    }

    const first =
      this.selected;

    this.selected = null;

    this.swapPieces(
      first.row,
      first.col,
      row,
      col
    );
  }

  private selectPiece(
    row: number,
    col: number
  ) {
    if (this.selected) {
      const old =
        this.board[
          this.selected.row
        ][
          this.selected.col
        ];

      if (old) {
        old.container.setScale(
          1
        );
      }
    }

    this.selected = {
      row,
      col
    };

    const piece =
      this.board[row][col];

    if (!piece) {
      return;
    }

    this.tweens.add({
      targets:
        piece.container,
      scale: 1.12,
      duration: 120,
      yoyo: true,
      repeat: 1
    });

    this.playSelectEffect(
      piece.container.x,
      piece.container.y
    );
  }

  // ==========================================================
  // SWAP
  // ==========================================================

  private swapPieces(
    r1: number,
    c1: number,
    r2: number,
    c2: number
  ) {
    const a =
      this.board[r1][c1];

    const b =
      this.board[r2][c2];

    if (!a || !b) {
      return;
    }

    this.busy = true;

    this.board[r1][c1] =
      b;

    this.board[r2][c2] =
      a;

    const ax =
      BOARD_X +
      c1 * CELL +
      CELL / 2;

    const ay =
      BOARD_Y +
      r1 * CELL +
      CELL / 2;

    const bx =
      BOARD_X +
      c2 * CELL +
      CELL / 2;

    const by =
      BOARD_Y +
      r2 * CELL +
      CELL / 2;

    this.tweens.add({
      targets:
        a.container,
      x: bx,
      y: by,
      duration: 180,
      ease: "Cubic.easeInOut"
    });

    this.tweens.add({
      targets:
        b.container,
      x: ax,
      y: ay,
      duration: 180,
      ease: "Cubic.easeInOut",
      onComplete: () => {
        const matches =
          this.findMatches();

        if (matches.length === 0) {
          this.board[r1][c1] =
            a;

          this.board[r2][c2] =
            b;

          this.tweens.add({
            targets:
              a.container,
            x: ax,
            y: ay,
            duration: 180,
            ease: "Back.easeOut"
          });

          this.tweens.add({
            targets:
              b.container,
            x: bx,
            y: by,
            duration: 180,
            ease: "Back.easeOut",
            onComplete: () => {
              this.busy = false;
            }
          });

          this.shakeBoard();
          return;
        }

        this.moves--;

        this.combo = 0;

        this.resolveMatches();
      }
    });
  }

  // ==========================================================
  // MATCH FINDER
  // ==========================================================

  private findMatches() {
    const matches =
      new Set<Piece>();

    // Horizontal.
    for (
      let row = 0;
      row < ROWS;
      row++
    ) {
      let start = 0;

      while (
        start < COLS
      ) {
        const piece =
          this.board[row][start];

        if (!piece) {
          start++;
          continue;
        }

        let end =
          start + 1;

        while (
          end < COLS &&
          this.board[row][end] &&
          this.board[row][end]!.type ===
            piece.type
        ) {
          end++;
        }

        if (
          end - start >= 3
        ) {
          for (
            let c = start;
            c < end;
            c++
          ) {
            if (
              this.board[row][c]
            ) {
              matches.add(
                this.board[row][c]!
              );
            }
          }
        }

        start = end;
      }
    }

    // Vertical.
    for (
      let col = 0;
      col < COLS;
      col++
    ) {
      let start = 0;

      while (
        start < ROWS
      ) {
        const piece =
          this.board[start][col];

        if (!piece) {
          start++;
          continue;
        }

        let end =
          start + 1;

        while (
          end < ROWS &&
          this.board[end][col] &&
          this.board[end][col]!.type ===
            piece.type
        ) {
          end++;
        }

        if (
          end - start >= 3
        ) {
          for (
            let r = start;
            r < end;
            r++
          ) {
            if (
              this.board[r][col]
            ) {
              matches.add(
                this.board[r][col]!
              );
            }
          }
        }

        start = end;
      }
    }

    return Array.from(
      matches
    );
  }

  // ==========================================================
  // MATCH RESOLUTION
  // ==========================================================

  private resolveMatches() {
    const matches =
      this.findMatches();

    if (
      matches.length === 0
    ) {
      this.busy = false;

      this.checkEnd();

      return;
    }

    this.combo++;

    const points =
      matches.length *
      100 *
      this.combo;

    this.score +=
      points;

    this.updateHUD();

    this.showCombo(
      this.combo,
      points
    );

    // Large center flash for meaningful matches.
    if (
      matches.length >= 4
    ) {
      const flash =
        this.add.rectangle(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2,
          GAME_WIDTH,
          GAME_HEIGHT,
          0xffffff,
          0.07
        );

      this.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 260,
        onComplete: () => {
          flash.destroy();
        }
      });
    }

    matches.forEach(
      (piece, index) => {
        this.createBurst(
          piece.container.x,
          piece.container.y,
          TYPES[piece.type].color
        );

        this.createFloatingScore(
          piece.container.x,
          piece.container.y,
          Math.round(
            points /
              matches.length
          )
        );

        this.tweens.add({
          targets:
            piece.container,
          scale: 1.45,
          angle:
            index % 2 === 0
              ? 8
              : -8,
          alpha: 0,
          duration: 230,
          delay:
            index * 18,
          ease: "Back.easeIn",
          onComplete: () => {
            piece.container.destroy();
          }
        });
      }
    );

    this.shakeBoard();

    this.time.delayedCall(
      275,
      () => {
        this.removeMatchedPieces(
          matches
        );

        this.collapseBoard();
      }
    );
  }

  private createFloatingScore(
    x: number,
    y: number,
    points: number
  ) {
    const text =
      this.add.text(
        x,
        y,
        `+${points}`,
        {
          fontFamily:
            "Arial Black, Arial",
          fontSize: "15px",
          color: "#ffffff",
          stroke: "#10232d",
          strokeThickness: 4
        }
      ).setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: y - 42,
      alpha: 0,
      scale: 1.18,
      duration: 650,
      ease: "Cubic.easeOut",
      onComplete: () => {
        text.destroy();
      }
    });
  }

  private removeMatchedPieces(
    matches: Piece[]
  ) {
    const matched =
      new Set(matches);

    for (
      let row = 0;
      row < ROWS;
      row++
    ) {
      for (
        let col = 0;
        col < COLS;
        col++
      ) {
        const piece =
          this.board[row][col];

        if (
          piece &&
          matched.has(piece)
        ) {
          this.board[row][col] =
            null;
        }
      }
    }
  }

  // ==========================================================
  // CASCADE
  // ==========================================================

  private collapseBoard() {
    const refill: {
      piece: Piece;
      row: number;
      col: number;
    }[] = [];

    for (
      let col = 0;
      col < COLS;
      col++
    ) {
      let writeRow =
        ROWS - 1;

      for (
        let row = ROWS - 1;
        row >= 0;
        row--
      ) {
        const piece =
          this.board[row][col];

        if (!piece) {
          continue;
        }

        if (
          writeRow !== row
        ) {
          this.board[writeRow][col] =
            piece;

          this.board[row][col] =
            null;
        }

        refill.push({
          piece,
          row: writeRow,
          col
        });

        writeRow--;
      }

      while (
        writeRow >= 0
      ) {
        const type =
          Phaser.Math.Between(
            0,
            TYPES.length - 1
          );

        const piece =
          this.createLogicalPiece(
            type
          );

        const container =
          this.createPiece(
            type,
            writeRow,
            col
          );

        piece.container =
          container;

        container.y =
          BOARD_Y -
          CELL *
            (ROWS - writeRow);

        this.board[
          writeRow
        ][col] =
          piece;

        refill.push({
          piece,
          row: writeRow,
          col
        });

        writeRow--;
      }
    }

    let longest =
      0;

    refill.forEach(
      ({ piece, row, col }) => {
        const targetX =
          BOARD_X +
          col * CELL +
          CELL / 2;

        const targetY =
          BOARD_Y +
          row * CELL +
          CELL / 2;

        longest =
          Math.max(
            longest,
            Math.abs(
              targetY -
                piece.container.y
            )
          );

        this.tweens.add({
          targets:
            piece.container,
          x: targetX,
          y: targetY,
          duration:
            260 +
            (ROWS - row) *
              15,
          ease: "Bounce.easeOut"
        });
      }
    );

    this.time.delayedCall(
      390,
      () => {
        this.resolveMatches();
      }
    );
  }

  private createLogicalPiece(
    type: number
  ): Piece {
    return {
      type,
      container:
        null as unknown as Phaser.GameObjects.Container
    };
  }

  // ==========================================================
  // HUD
  // ==========================================================

  private updateHUD() {
    this.scoreText.setText(
      this.score
        .toString()
        .padStart(6, "0")
    );

    this.movesText.setText(
      this.moves.toString()
    );

    this.objectiveText.setText(
      this.score >= 2500
        ? "MAZE OBJECTIVE COMPLETE"
        : "REACH 2,500 POINTS"
    );

    if (
      this.moves <= 5
    ) {
      this.movesText.setColor(
        "#ff6b7d"
      );
    } else {
      this.movesText.setColor(
        "#ffffff"
      );
    }
  }

  private showCombo(
    combo: number,
    points: number
  ) {
    if (
      combo < 2
    ) {
      return;
    }

    this.comboText.setText(
      `${combo}X COMBO   +${points}`
    );

    this.comboText.setAlpha(
      1
    );

    this.comboText.setScale(
      0.55
    );

    this.comboText.setY(
      105
    );

    this.tweens.add({
      targets:
        this.comboText,
      scale: 1.18,
      y: 98,
      duration: 180,
      ease: "Back.easeOut"
    });

    this.tweens.add({
      targets:
        this.comboText,
      alpha: 0,
      delay: 720,
      duration: 420
    });

    // Extra particles around combo text.
    for (
      let i = 0;
      i < Math.min(combo + 2, 8);
      i++
    ) {
      const sparkle =
        this.add.text(
          GAME_WIDTH / 2 +
            Phaser.Math.Between(
              -100,
              100
            ),
          108 +
            Phaser.Math.Between(
              -8,
              8
            ),
          "✦",
          {
            fontFamily:
              "Arial Black, Arial",
            fontSize: "12px",
            color: "#69e6c3"
          }
        ).setOrigin(0.5);

      this.tweens.add({
        targets: sparkle,
        y:
          sparkle.y -
          Phaser.Math.Between(
            20,
            45
          ),
        alpha: 0,
        scale: 0.2,
        duration: 500,
        delay:
          i * 25,
        onComplete: () => {
          sparkle.destroy();
        }
      });
    }
  }

  // ==========================================================
  // EFFECTS
  // ==========================================================

  private createBurst(
    x: number,
    y: number,
    color: number
  ) {
    // Expanding shockwave.
    const ring =
      this.add.circle(
        x,
        y,
        13,
        color,
        0
      );

    ring.setStrokeStyle(
      3,
      color,
      0.8
    );

    this.tweens.add({
      targets: ring,
      radius: 43,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => {
        ring.destroy();
      }
    });

    // Particle burst.
    for (
      let i = 0;
      i < 14;
      i++
    ) {
      const particle =
        this.add.circle(
          x,
          y,
          Phaser.Math.Between(
            2,
            5
          ),
          color,
          1
        );

      const angle =
        Phaser.Math.FloatBetween(
          0,
          Math.PI * 2
        );

      const distance =
        Phaser.Math.Between(
          28,
          72
        );

      this.tweens.add({
        targets:
          particle,
        x:
          x +
          Math.cos(angle) *
            distance,
        y:
          y +
          Math.sin(angle) *
            distance,
        scale:
          Phaser.Math.FloatBetween(
            0.1,
            0.45
          ),
        alpha: 0,
        duration:
          Phaser.Math.Between(
            300,
            560
          ),
        ease: "Cubic.easeOut",
        onComplete: () => {
          particle.destroy();
        }
      });
    }

    // Central sparkle.
    const sparkle =
      this.add.text(
        x,
        y,
        "✦",
        {
          fontFamily:
            "Arial Black, Arial",
          fontSize: "24px",
          color: "#ffffff",
          stroke: "#10232d",
          strokeThickness: 3
        }
      ).setOrigin(0.5);

    this.tweens.add({
      targets: sparkle,
      scale: 1.8,
      angle: 90,
      alpha: 0,
      duration: 380,
      ease: "Back.easeOut",
      onComplete: () => {
        sparkle.destroy();
      }
    });
  }

  private playSelectEffect(
    x: number,
    y: number
  ) {
    const ring =
      this.add.circle(
        x,
        y,
        26,
        0x55d8bb,
        0
      );

    ring.setStrokeStyle(
      2,
      0x55d8bb,
      0.9
    );

    this.tweens.add({
      targets: ring,
      radius: 38,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        ring.destroy();
      }
    });
  }

  private shakeBoard() {
    this.tweens.add({
      targets:
        this.boardGlow,
      x: 5,
      duration: 45,
      yoyo: true,
      repeat: 3
    });
  }

  // ==========================================================
  // END GAME
  // ==========================================================

  private checkEnd() {
    if (
      this.score >= 2500
    ) {
      this.showEndScreen(
        true
      );

      return;
    }

    if (
      this.moves <= 0
    ) {
      this.showEndScreen(
        false
      );
    }
  }

  private showEndScreen(
    won: boolean
  ) {
    this.busy = true;

    this.add.rectangle(
      0,
      0,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x02070d,
      0.82
    ).setOrigin(0);

    const panel =
      this.add.rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        450,
        280,
        0x0b1b28,
        0.98
      );

    panel.setStrokeStyle(
      2,
      won
        ? 0x55d8bb
        : 0xff5570,
      0.7
    );

    this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 - 75,
      won
        ? "MAZE CLEARED"
        : "RUN ENDED",
      {
        fontFamily:
          "Arial Black, Arial",
        fontSize: "34px",
        color: won
          ? "#69e6c3"
          : "#ff7085"
      }
    ).setOrigin(0.5);

    this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 - 25,
      won
        ? "You broke through the candy maze."
        : "The maze got the better of you.",
      {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#a9bac4"
      }
    ).setOrigin(0.5);

    this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 18,
      `FINAL SCORE  ${this.score}`,
      {
        fontFamily:
          "Arial Black, Arial",
        fontSize: "21px",
        color: "#ffffff"
      }
    ).setOrigin(0.5);

    const restart =
      this.add
        .rectangle(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2 + 78,
          170,
          48,
          0x55d8bb,
          1
        )
        .setInteractive({
          useHandCursor: true
        });

    this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 78,
      "PLAY AGAIN",
      {
        fontFamily:
          "Arial Black, Arial",
        fontSize: "14px",
        color: "#06131b"
      }
    ).setOrigin(0.5);

    restart.on(
      "pointerover",
      () => {
        restart.setFillStyle(
          0x7af0d3
        );
      }
    );

    restart.on(
      "pointerout",
      () => {
        restart.setFillStyle(
          0x55d8bb
        );
      }
    );

    restart.on(
      "pointerdown",
      () => {
        this.scene.restart();
      }
    );
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,

  width: GAME_WIDTH,
  height: GAME_HEIGHT,

  parent: "game",

  backgroundColor:
    "#07121c",

  scale: {
    mode:
      Phaser.Scale.FIT,
    autoCenter:
      Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT
  },

  render: {
    antialias: true,
    roundPixels: false
  },

  input: {
    activePointers: 3
  },

  scene: [
    MazeHunter
  ]
};

new Phaser.Game(config);



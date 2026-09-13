import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import "./App.css";

type Side = "white" | "black";

type Repertoire = {
  side: Side;
  lines: string[][];
};

type Flashcard = {
  side: Side;
  history: string[];
  expectedMoves: string[];
};

type ExportData = {
  version: 1;
  exportedAt: string;
  repertoires: Repertoire[];
};

type AnalysisResult = {
  side: Side;
  deviationIndex: number | null;
  playedMove: string | null;
  expectedMoves: string[];
  matchedMoves: string[];
  playerWhoDeviated: Side | null;
  theoryEnded: boolean;
  positionHistory: string[];
};

function App() {
  const [game, setGame] = useState(new Chess());
  const [moves, setMoves] = useState<string[]>([]);
  const [side, setSide] = useState<Side>("white");

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const gameInputRef = useRef<HTMLInputElement | null>(null);

  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const [repertoires, setRepertoires] = useState<Repertoire[]>(() => {
    const stored = localStorage.getItem("chess-lines");

    if (!stored) return [];

    try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) return [];

      const converted: Repertoire[] = [];

      for (const item of parsed) {
        if (!item) continue;

        const itemSide: Side =
          item.side === "black" ? "black" : "white";

        let lines: string[][] = [];

        if (Array.isArray(item.lines)) {
          lines = item.lines;
        } else if (Array.isArray(item.moves)) {
          lines = [item.moves];
        }

        if (lines.length === 0) continue;

        const existing = converted.find(
          (rep) => rep.side === itemSide
        );

        if (existing) {
          existing.lines.push(...lines);
        } else {
          converted.push({
            side: itemSide,
            lines,
          });
        }
      }

      return cleanRepertoires(converted);
    } catch {
      return [];
    }
  });

  const [practiceRepertoire, setPracticeRepertoire] =
    useState<Repertoire | null>(null);

  const [practiceLine, setPracticeLine] =
    useState<string[] | null>(null);

  const [practiceQueue, setPracticeQueue] =
    useState<string[][]>([]);

  const [practiceRoundNumber, setPracticeRoundNumber] =
    useState(1);

  const [flashcardRepertoire, setFlashcardRepertoire] =
    useState<Repertoire | null>(null);

  const [flashcard, setFlashcard] =
    useState<Flashcard | null>(null);

  const [selectedSquare, setSelectedSquare] =
    useState<Square | null>(null);

  const [message, setMessage] = useState("");

  const [isOpponentMoving, setIsOpponentMoving] =
    useState(false);

  const [isLoadingNextFlashcard, setIsLoadingNextFlashcard] =
    useState(false);

  const [analysisMode, setAnalysisMode] = useState(false);
  const [analysisPgn, setAnalysisPgn] = useState("");
  const [analysisMoves, setAnalysisMoves] = useState<string[]>([]);
  const [analysisResults, setAnalysisResults] =
    useState<AnalysisResult[]>([]);

  const [analysisSide, setAnalysisSide] =
    useState<Side>("white");

  const [selectedAnalysis, setSelectedAnalysis] =
    useState<AnalysisResult | null>(null);

  useEffect(() => {
    localStorage.setItem(
      "chess-lines",
      JSON.stringify(repertoires)
    );
  }, [repertoires]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(pointer: coarse)");

    const updateTouchMode = () => {
      setIsTouchDevice(mediaQuery.matches);
    };

    updateTouchMode();

    mediaQuery.addEventListener?.("change", updateTouchMode);

    return () => {
      mediaQuery.removeEventListener?.("change", updateTouchMode);
    };
  }, []);

  const boardOrientation = useMemo<Side>(() => {
    if (analysisMode) return analysisSide;
    if (flashcardRepertoire) return flashcardRepertoire.side;
    if (practiceRepertoire) return practiceRepertoire.side;
    return side;
  }, [
    analysisMode,
    analysisSide,
    flashcardRepertoire,
    practiceRepertoire,
    side,
  ]);

  function sameLine(a: string[], b: string[]) {
    if (a.length !== b.length) return false;

    return a.every(
      (move, index) => move === b[index]
    );
  }

  function isPrefix(
    shorter: string[],
    longer: string[]
  ) {
    if (shorter.length > longer.length) return false;

    return shorter.every(
      (move, index) => move === longer[index]
    );
  }

  function cleanLines(lines: string[][]) {
    const validLines = lines.filter(
      (line) =>
        Array.isArray(line) &&
        line.length > 0 &&
        line.every(
          (move) => typeof move === "string"
        )
    );

    const uniqueLines: string[][] = [];

    for (const line of validLines) {
      const duplicate = uniqueLines.some(
        (existing) => sameLine(existing, line)
      );

      if (!duplicate) {
        uniqueLines.push([...line]);
      }
    }

    return uniqueLines.filter(
      (line, index) =>
        !uniqueLines.some(
          (otherLine, otherIndex) =>
            index !== otherIndex &&
            otherLine.length > line.length &&
            isPrefix(line, otherLine)
        )
    );
  }

  function cleanRepertoires(
    reps: Repertoire[]
  ): Repertoire[] {
    const result: Repertoire[] = [];

    for (const rep of reps) {
      if (
        rep.side !== "white" &&
        rep.side !== "black"
      ) {
        continue;
      }

      const cleanedLines = cleanLines(
        rep.lines ?? []
      );

      if (cleanedLines.length === 0) continue;

      const existing = result.find(
        (item) => item.side === rep.side
      );

      if (existing) {
        existing.lines = cleanLines([
          ...existing.lines,
          ...cleanedLines,
        ]);
      } else {
        result.push({
          side: rep.side,
          lines: cleanedLines,
        });
      }
    }

    return result;
  }

  function lineMatchesHistory(
    line: string[],
    history: string[]
  ) {
    if (history.length > line.length) return false;

    return history.every(
      (move, index) => line[index] === move
    );
  }

  function getMatchingLines(
    rep: Repertoire,
    history: string[]
  ) {
    return rep.lines.filter((line) =>
      lineMatchesHistory(line, history)
    );
  }

  function formatLine(line: string[]) {
    const result: string[] = [];

    for (let i = 0; i < line.length; i++) {
      if (i % 2 === 0) {
        result.push(`${Math.floor(i / 2) + 1}.`);
      }

      result.push(line[i]);
    }

    return result.join(" ");
  }

  function chooseRandom<T>(items: T[]) {
    return items[
      Math.floor(Math.random() * items.length)
    ];
  }

  function shuffleLines(lines: string[][]) {
    const shuffled = lines.map((line) => [...line]);

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(
        Math.random() * (i + 1)
      );

      [shuffled[i], shuffled[j]] = [
        shuffled[j],
        shuffled[i],
      ];
    }

    return shuffled;
  }

  function buildGameFromHistory(
    history: string[]
  ) {
    const rebuiltGame = new Chess();

    for (const move of history) {
      rebuiltGame.move(move);
    }

    return rebuiltGame;
  }

  function resetBoard() {
    setGame(new Chess());
    setMoves([]);
    setSelectedSquare(null);
    setMessage("");
    setIsOpponentMoving(false);
    setIsLoadingNextFlashcard(false);
  }

  function undoMove() {
    if (
      practiceRepertoire ||
      flashcardRepertoire ||
      analysisMode
    ) {
      return;
    }

    if (moves.length === 0) {
      setMessage("No move to undo.");
      return;
    }

    const newMoves = moves.slice(0, -1);

    setGame(
      buildGameFromHistory(newMoves)
    );

    setMoves(newMoves);
    setSelectedSquare(null);
    setMessage("Last move undone.");
  }

  function saveLine() {
    if (moves.length === 0) {
      setMessage("Make some moves first.");
      return;
    }

    const updated = cleanRepertoires([
      ...repertoires,
      {
        side,
        lines: [[...moves]],
      },
    ]);

    setRepertoires(updated);
    setMessage("Line saved.");
  }

  function deleteLine(
    repSide: Side,
    indexToDelete: number
  ) {
    setRepertoires((previous) =>
      previous
        .map((rep) => {
          if (rep.side !== repSide) return rep;

          return {
            ...rep,
            lines: rep.lines.filter(
              (_, index) =>
                index !== indexToDelete
            ),
          };
        })
        .filter(
          (rep) => rep.lines.length > 0
        )
    );

    setMessage("Line deleted.");
  }

  function exportRepertoire() {
    if (repertoires.length === 0) {
      setMessage(
        "There is nothing to export."
      );
      return;
    }

    const exportData: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      repertoires,
    };

    const blob = new Blob(
      [
        JSON.stringify(
          exportData,
          null,
          2
        ),
      ],
      {
        type: "application/json",
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `chess-lines-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    setMessage(
      "Repertoire exported."
    );
  }

  function openImportPicker() {
    importInputRef.current?.click();
  }

  async function importRepertoire(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      let imported: Repertoire[] = [];

      if (
        parsed &&
        Array.isArray(parsed.repertoires)
      ) {
        imported = parsed.repertoires;
      } else if (Array.isArray(parsed)) {
        imported = parsed;
      } else {
        throw new Error();
      }

      setRepertoires(
        cleanRepertoires([
          ...repertoires,
          ...imported,
        ])
      );

      setMessage("Import complete.");
    } catch {
      setMessage(
        "Could not import this file."
      );
    }

    event.target.value = "";
  }

  // =========================
  // PRACTICE
  // =========================

  function beginPracticeRound(
    rep: Repertoire,
    line: string[],
    remainingQueue: string[][],
    roundNumber: number
  ) {
    const freshGame = new Chess();

    setPracticeRepertoire(rep);
    setPracticeLine(line);
    setPracticeQueue(remainingQueue);
    setPracticeRoundNumber(roundNumber);

    setGame(freshGame);
    setMoves([]);
    setSelectedSquare(null);

    if (rep.side === "white") {
      setIsOpponentMoving(false);
      setMessage("Your move.");
    } else {
      setIsOpponentMoving(true);
      setMessage("Opponent is moving...");

      setTimeout(() => {
        playPracticeOpponentMove(
          freshGame,
          rep,
          line,
          [],
          remainingQueue,
          roundNumber
        );
      }, 500);
    }
  }

  function startPractice(
    rep: Repertoire
  ) {
    if (rep.lines.length === 0) return;

    setAnalysisMode(false);
    setFlashcardRepertoire(null);
    setFlashcard(null);
    setIsLoadingNextFlashcard(false);

    const shuffled =
      shuffleLines(rep.lines);

    beginPracticeRound(
      rep,
      shuffled[0],
      shuffled.slice(1),
      1
    );
  }

  function finishPracticeLine(
    rep: Repertoire,
    completedLine: string[],
    remainingQueue: string[][],
    roundNumber: number
  ) {
    setIsOpponentMoving(true);
    setMessage(
      "Line complete! Next line..."
    );

    setTimeout(() => {
      let queue =
        remainingQueue.map(
          (line) => [...line]
        );

      let nextRound =
        roundNumber + 1;

      if (queue.length === 0) {
        queue =
          shuffleLines(rep.lines);

        if (
          queue.length > 1 &&
          sameLine(
            queue[0],
            completedLine
          )
        ) {
          [queue[0], queue[1]] = [
            queue[1],
            queue[0],
          ];
        }

        nextRound = 1;
      }

      beginPracticeRound(
        rep,
        queue[0],
        queue.slice(1),
        nextRound
      );
    }, 500);
  }

  function playPracticeOpponentMove(
    currentGame: Chess,
    rep: Repertoire,
    line: string[],
    currentMoves: string[],
    remainingQueue: string[][],
    roundNumber: number
  ) {
    const moveIndex =
      currentMoves.length;

    const opponentMove =
      line[moveIndex];

    if (!opponentMove) {
      finishPracticeLine(
        rep,
        line,
        remainingQueue,
        roundNumber
      );

      return;
    }

    const nextGame =
      new Chess(currentGame.fen());

    try {
      nextGame.move(
        opponentMove
      );
    } catch {
      setIsOpponentMoving(false);

      setMessage(
        `Could not play ${opponentMove}`
      );

      return;
    }

    const newMoves = [
      ...currentMoves,
      opponentMove,
    ];

    setGame(nextGame);
    setMoves(newMoves);
    setSelectedSquare(null);

    if (
      newMoves.length >=
      line.length
    ) {
      finishPracticeLine(
        rep,
        line,
        remainingQueue,
        roundNumber
      );

      return;
    }

    setIsOpponentMoving(false);
    setMessage("Your move.");
  }

  function showPracticeHint() {
    if (
      !practiceLine ||
      isOpponentMoving
    ) {
      return;
    }

    const expectedMove =
      practiceLine[moves.length];

    if (!expectedMove) {
      setMessage(
        "This line is complete."
      );

      return;
    }

    setMessage(
      `Hint: ${expectedMove}`
    );
  }

  function makePracticeMove(
    sourceSquare: Square,
    targetSquare: Square
  ) {
    if (
      !practiceRepertoire ||
      !practiceLine ||
      isOpponentMoving
    ) {
      return false;
    }

    const moveIndex =
      moves.length;

    const expectedMove =
      practiceLine[moveIndex];

    if (!expectedMove) {
      return false;
    }

    const testGame =
      new Chess(game.fen());

    let playedMove;

    try {
      playedMove =
        testGame.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
    } catch {
      return false;
    }

    if (!playedMove) {
      return false;
    }

    if (
      playedMove.san !==
      expectedMove
    ) {
      setMessage(
        "Wrong move. Try again."
      );

      return false;
    }

    const newMoves = [
      ...moves,
      playedMove.san,
    ];

    setGame(testGame);
    setMoves(newMoves);
    setSelectedSquare(null);

    if (
      newMoves.length >=
      practiceLine.length
    ) {
      setMessage("Correct!");

      finishPracticeLine(
        practiceRepertoire,
        practiceLine,
        practiceQueue,
        practiceRoundNumber
      );

      return true;
    }

    setMessage("Correct!");
    setIsOpponentMoving(true);

    setTimeout(() => {
      playPracticeOpponentMove(
        testGame,
        practiceRepertoire,
        practiceLine,
        newMoves,
        practiceQueue,
        practiceRoundNumber
      );
    }, 500);

    return true;
  }

  function restartPractice() {
    if (!practiceRepertoire) return;

    startPractice(
      practiceRepertoire
    );
  }

  function stopPractice() {
    setPracticeRepertoire(null);
    setPracticeLine(null);
    setPracticeQueue([]);
    setPracticeRoundNumber(1);

    resetBoard();
  }

  // =========================
  // FLASHCARDS
  // =========================

  function getFlashcardCandidates(
    rep: Repertoire
  ) {
    const candidates:
      Flashcard[] = [];

    const usedPositions =
      new Set<string>();

    for (const line of rep.lines) {
      for (
        let moveIndex = 0;
        moveIndex <
        line.length;
        moveIndex++
      ) {
        const whiteToMove =
          moveIndex % 2 === 0;

        const userToMove =
          rep.side === "white"
            ? whiteToMove
            : !whiteToMove;

        if (!userToMove) continue;
        if (moveIndex === 0) continue;

        const history =
          line.slice(
            0,
            moveIndex
          );

        const matchingLines =
          getMatchingLines(
            rep,
            history
          );

        const expectedMoves =
          Array.from(
            new Set(
              matchingLines
                .filter(
                  (matchingLine) =>
                    matchingLine.length >
                    moveIndex
                )
                .map(
                  (matchingLine) =>
                    matchingLine[
                      moveIndex
                    ]
                )
            )
          );

        if (
          expectedMoves.length === 0
        ) {
          continue;
        }

        const key =
          history.join("|");

        if (
          usedPositions.has(key)
        ) {
          continue;
        }

        usedPositions.add(key);

        candidates.push({
          side: rep.side,
          history,
          expectedMoves,
        });
      }
    }

    return candidates;
  }

  function nextFlashcard(
    rep: Repertoire
  ) {
    const candidates =
      getFlashcardCandidates(
        rep
      );

    if (
      candidates.length === 0
    ) {
      setMessage(
        "Not enough saved positions for flashcards."
      );

      setIsLoadingNextFlashcard(false);

      return;
    }

    const card =
      chooseRandom(candidates);

    setFlashcardRepertoire(rep);
    setPracticeRepertoire(null);
    setPracticeLine(null);
    setFlashcard(card);

    setGame(
      buildGameFromHistory(
        card.history
      )
    );

    setMoves([]);
    setSelectedSquare(null);
    setIsOpponentMoving(false);
    setIsLoadingNextFlashcard(false);

    setMessage(
      "Find the best move."
    );
  }

  function startFlashcard(
    rep: Repertoire
  ) {
    setAnalysisMode(false);
    nextFlashcard(rep);
  }

  function stopFlashcard() {
    setFlashcardRepertoire(null);
    setFlashcard(null);
    resetBoard();
  }

  function showFlashcardHint() {
    if (!flashcard) return;

    setMessage(
      `Hint: ${flashcard.expectedMoves.join(
        " or "
      )}`
    );
  }

  function showFlashcardAnswer() {
    if (!flashcard) return;

    setMessage(
      `Answer: ${flashcard.expectedMoves.join(
        " or "
      )}`
    );
  }

  function makeFlashcardMove(
    sourceSquare: Square,
    targetSquare: Square
  ) {
    if (
      !flashcard ||
      !flashcardRepertoire ||
      isLoadingNextFlashcard
    ) {
      return false;
    }

    const testGame =
      new Chess(game.fen());

    let move;

    try {
      move = testGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
    } catch {
      return false;
    }

    if (!move) return false;

    if (
      !flashcard.expectedMoves.includes(
        move.san
      )
    ) {
      setMessage(
        "Wrong move. Try again."
      );

      return false;
    }

    setGame(testGame);
    setSelectedSquare(null);
    setMessage("Correct!");

    setIsLoadingNextFlashcard(true);

    setTimeout(() => {
      nextFlashcard(
        flashcardRepertoire
      );
    }, 500);

    return true;
  }

  // =========================
  // NORMAL MOVES
  // =========================

  function makeNormalMove(
    sourceSquare: Square,
    targetSquare: Square
  ) {
    const nextGame =
      new Chess(game.fen());

    try {
      const move =
        nextGame.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });

      if (!move) return false;

      setGame(nextGame);

      setMoves((previous) => [
        ...previous,
        move.san,
      ]);

      setMessage("");

      return true;
    } catch {
      return false;
    }
  }

  function makeMove(
    sourceSquare: Square,
    targetSquare: Square
  ) {
    if (analysisMode) {
      return false;
    }

    if (flashcardRepertoire) {
      return makeFlashcardMove(
        sourceSquare,
        targetSquare
      );
    }

    if (practiceRepertoire) {
      return makePracticeMove(
        sourceSquare,
        targetSquare
      );
    }

    return makeNormalMove(
      sourceSquare,
      targetSquare
    );
  }

  function handleSquareClick(
    square: Square
  ) {
    if (
      analysisMode ||
      isOpponentMoving ||
      isLoadingNextFlashcard
    ) {
      return;
    }

    if (!selectedSquare) {
      const piece =
        game.get(square);

      if (!piece) return;

      setSelectedSquare(square);
      return;
    }

    if (
      selectedSquare === square
    ) {
      setSelectedSquare(null);
      return;
    }

    const success =
      makeMove(
        selectedSquare,
        square
      );

    if (success) {
      setSelectedSquare(null);
      return;
    }

    const clickedPiece =
      game.get(square);

    if (clickedPiece) {
      setSelectedSquare(square);
    } else {
      setSelectedSquare(null);
    }
  }

  // =========================
  // ANALYSIS
  // =========================

  function analyzeAgainstRepertoire(
    rep: Repertoire,
    gameMoves: string[]
  ): AnalysisResult {
    let matchingLines = [
      ...rep.lines,
    ];

    const matchedMoves:
      string[] = [];

    for (
      let i = 0;
      i < gameMoves.length;
      i++
    ) {
      const expectedMoves =
        Array.from(
          new Set(
            matchingLines
              .filter(
                (line) =>
                  line.length > i
              )
              .map(
                (line) =>
                  line[i]
              )
          )
        );

      if (
        expectedMoves.length === 0
      ) {
        return {
          side: rep.side,
          deviationIndex: i,
          playedMove:
            gameMoves[i],
          expectedMoves: [],
          matchedMoves,
          playerWhoDeviated:
            i % 2 === 0
              ? "white"
              : "black",
          theoryEnded: true,
          positionHistory: [
            ...matchedMoves,
            gameMoves[i],
          ],
        };
      }

      if (
        !expectedMoves.includes(
          gameMoves[i]
        )
      ) {
        return {
          side: rep.side,
          deviationIndex: i,
          playedMove:
            gameMoves[i],
          expectedMoves,
          matchedMoves,
          playerWhoDeviated:
            i % 2 === 0
              ? "white"
              : "black",
          theoryEnded: false,
          positionHistory: [
            ...matchedMoves,
            gameMoves[i],
          ],
        };
      }

      matchedMoves.push(
        gameMoves[i]
      );

      matchingLines =
        matchingLines.filter(
          (line) =>
            line[i] ===
            gameMoves[i]
        );
    }

    return {
      side: rep.side,
      deviationIndex: null,
      playedMove: null,
      expectedMoves: [],
      matchedMoves,
      playerWhoDeviated: null,
      theoryEnded: false,
      positionHistory: [
        ...gameMoves,
      ],
    };
  }

  function showAnalysisPosition(
    result: AnalysisResult
  ) {
    setSelectedAnalysis(result);
    setAnalysisSide(result.side);

    setGame(
      buildGameFromHistory(
        result.positionHistory
      )
    );

    setSelectedSquare(null);
  }

  function analyzePgn(
    pgn: string
  ) {
    if (!pgn.trim()) {
      setMessage(
        "Paste or open a PGN first."
      );
      return;
    }

    try {
      const analyzedGame =
        new Chess();

      analyzedGame.loadPgn(pgn);

      const gameMoves =
        analyzedGame.history();

      if (
        gameMoves.length === 0
      ) {
        throw new Error();
      }

      const results =
        repertoires.map(
          (rep) =>
            analyzeAgainstRepertoire(
              rep,
              gameMoves
            )
        );

      setAnalysisMoves(
        gameMoves
      );

      setAnalysisResults(
        results
      );

      if (
        results.length > 0
      ) {
        const bestMatch =
          [...results].sort(
            (a, b) =>
              b.matchedMoves.length -
              a.matchedMoves.length
          )[0];

        setSelectedAnalysis(
          bestMatch
        );

        setAnalysisSide(
          bestMatch.side
        );

        setGame(
          buildGameFromHistory(
            bestMatch.positionHistory
          )
        );

        if (
          bestMatch.deviationIndex !==
          null
        ) {
          setMessage(
            `${
              bestMatch.side === "white"
                ? "White"
                : "Black"
            } repertoire selected. Board shows the position after the first deviation.`
          );
        } else {
          setMessage(
            `Game follows the ${
              bestMatch.side === "white"
                ? "White"
                : "Black"
            } repertoire for the entire analyzed portion.`
          );
        }
      } else {
        setGame(
          buildGameFromHistory(
            gameMoves
          )
        );

        setMessage(
          "No saved repertoire to compare against."
        );
      }
    } catch {
      setMessage(
        "Could not read this PGN."
      );
    }
  }

  function startAnalysis() {
    setPracticeRepertoire(null);
    setPracticeLine(null);
    setPracticeQueue([]);

    setFlashcardRepertoire(null);
    setFlashcard(null);

    setAnalysisMode(true);

    setGame(new Chess());
    setMoves([]);
    setSelectedSquare(null);

    setAnalysisPgn("");
    setAnalysisMoves([]);
    setAnalysisResults([]);
    setSelectedAnalysis(null);

    setMessage("");
  }

  function stopAnalysis() {
    setAnalysisMode(false);

    setAnalysisPgn("");
    setAnalysisMoves([]);
    setAnalysisResults([]);
    setSelectedAnalysis(null);

    resetBoard();
  }

  function openGamePicker() {
    gameInputRef.current?.click();
  }

  async function openPgnFile(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    try {
      const text =
        await file.text();

      setAnalysisPgn(text);

      analyzePgn(text);
    } catch {
      setMessage(
        "Could not open PGN."
      );
    }

    event.target.value = "";
  }

  return (
    <div className="app">
      <h1>Chess Lines Trainer</h1>

      <div className="content">
        <div className="board-wrapper">
          <div className="board">
            <Chessboard
              options={{
                position: game.fen(),

                boardOrientation,

                animationDurationInMs:
                  120,

                allowDragging:
                  !isTouchDevice &&
                  !analysisMode &&
                  !isOpponentMoving &&
                  !isLoadingNextFlashcard,

                onPieceDrop: ({
                  sourceSquare,
                  targetSquare,
                }) => {
                  if (
                    isTouchDevice ||
                    analysisMode ||
                    !targetSquare ||
                    isOpponentMoving ||
                    isLoadingNextFlashcard
                  ) {
                    return false;
                  }

                  return makeMove(
                    sourceSquare as Square,
                    targetSquare as Square
                  );
                },

                onSquareClick: ({
                  square,
                }) => {
                  handleSquareClick(
                    square as Square
                  );
                },

                squareStyles:
                  selectedSquare
                    ? {
                        [selectedSquare]:
                          {
                            backgroundColor:
                              "rgba(255, 215, 0, 0.65)",
                            boxShadow:
                              "inset 0 0 0 4px rgba(255,255,255,0.5)",
                          },
                      }
                    : {},
              }}
            />
          </div>
        </div>

        <div className="panel">
          {analysisMode ? (
            <>
              <h2>Game Analysis</h2>

              <p className="practice-info">
                The board shows the position
                immediately after the first
                move that left your repertoire.
              </p>

              <button
                onClick={
                  openGamePicker
                }
              >
                Open PGN file
              </button>

              <input
                ref={gameInputRef}
                type="file"
                accept=".pgn,.txt"
                onChange={
                  openPgnFile
                }
                style={{
                  display: "none",
                }}
              />

              <textarea
                className="pgn-input"
                placeholder="Or paste PGN here..."
                value={
                  analysisPgn
                }
                onChange={(event) =>
                  setAnalysisPgn(
                    event.target.value
                  )
                }
              />

              <button
                onClick={() =>
                  analyzePgn(
                    analysisPgn
                  )
                }
              >
                Analyze
              </button>

              {selectedAnalysis && (
                <p className="practice-info">
                  Showing{" "}
                  <strong>
                    {selectedAnalysis.side ===
                    "white"
                      ? "White"
                      : "Black"}
                  </strong>{" "}
                  repertoire perspective
                </p>
              )}

              {analysisMoves.length >
                0 && (
                <>
                  <h3>Full game</h3>

                  <div className="moves">
                    {formatLine(
                      analysisMoves
                    )}
                  </div>
                </>
              )}

              {analysisResults.map(
                (result) => (
                  <div
                    className="analysis-result"
                    key={
                      result.side
                    }
                  >
                    <h3>
                      {result.side ===
                      "white"
                        ? "White repertoire"
                        : "Black repertoire"}
                    </h3>

                    {result.deviationIndex ===
                    null ? (
                      <>
                        <div className="analysis-good">
                          No deviation found
                          in the played
                          portion of the game.
                        </div>

                        <button
                          onClick={() =>
                            showAnalysisPosition(
                              result
                            )
                          }
                        >
                          Show final position
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="analysis-label">
                          Theory followed
                          until:
                        </div>

                        <div className="analysis-history">
                          {result
                            .matchedMoves
                            .length ===
                          0
                            ? "Starting position"
                            : formatLine(
                                result.matchedMoves
                              )}
                        </div>

                        <div className="analysis-deviation">
                          <strong>
                            {result.playerWhoDeviated ===
                            "white"
                              ? "White"
                              : "Black"}{" "}
                            deviated
                          </strong>

                          <div>
                            Move:{" "}
                            {Math.floor(
                              result.deviationIndex /
                                2
                            ) + 1}
                            {result.deviationIndex %
                              2 ===
                            0
                              ? "."
                              : "..."}
                          </div>

                          <div>
                            Played:{" "}
                            <strong>
                              {
                                result.playedMove
                              }
                            </strong>
                          </div>

                          {result.theoryEnded ? (
                            <div>
                              Your saved
                              theory ends
                              before this
                              move.
                            </div>
                          ) : (
                            <div>
                              Expected:{" "}
                              <strong>
                                {result.expectedMoves.join(
                                  " or "
                                )}
                              </strong>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() =>
                            showAnalysisPosition(
                              result
                            )
                          }
                        >
                          Show position after deviation
                        </button>
                      </>
                    )}
                  </div>
                )
              )}

              <button
                onClick={
                  stopAnalysis
                }
              >
                Exit analysis
              </button>
            </>
          ) : !practiceRepertoire &&
            !flashcardRepertoire ? (
            <>
              <h2>Create line</h2>

              <div className="side-selector">
                <label>
                  <input
                    type="radio"
                    checked={
                      side === "white"
                    }
                    onChange={() =>
                      setSide("white")
                    }
                  />
                  White repertoire
                </label>

                <label>
                  <input
                    type="radio"
                    checked={
                      side === "black"
                    }
                    onChange={() =>
                      setSide("black")
                    }
                  />
                  Black repertoire
                </label>
              </div>

              <h3>Current line</h3>

              <div className="moves">
                {moves.length === 0
                  ? "Make some moves..."
                  : formatLine(moves)}
              </div>

              <button
                onClick={saveLine}
              >
                Save line
              </button>

              <button
                onClick={undoMove}
                disabled={
                  moves.length === 0
                }
              >
                Undo move
              </button>

              <button
                onClick={resetBoard}
              >
                Reset board
              </button>

              <button
                onClick={
                  startAnalysis
                }
              >
                Analyze game
              </button>

              <div className="sync-section">
                <h2>
                  Import / Export
                </h2>

                <button
                  onClick={
                    exportRepertoire
                  }
                >
                  Export repertoire
                </button>

                <button
                  onClick={
                    openImportPicker
                  }
                >
                  Import repertoire
                </button>

                <input
                  ref={
                    importInputRef
                  }
                  type="file"
                  accept=".json,application/json"
                  onChange={
                    importRepertoire
                  }
                  style={{
                    display: "none",
                  }}
                />
              </div>

              <h2>Repertoires</h2>

              {repertoires.length ===
              0 ? (
                <p>
                  No lines saved.
                </p>
              ) : (
                <div className="saved-lines">
                  {repertoires.map(
                    (rep) => (
                      <div
                        className="saved-line"
                        key={
                          rep.side
                        }
                      >
                        <div className="saved-line-info">
                          <strong>
                            {rep.side ===
                            "white"
                              ? "White repertoire"
                              : "Black repertoire"}
                          </strong>

                          <div className="branch-count">
                            {
                              rep.lines
                                .length
                            }{" "}
                            {rep.lines
                              .length ===
                            1
                              ? "line"
                              : "lines"}
                          </div>
                        </div>

                        <div className="branch-list">
                          {rep.lines.map(
                            (
                              line,
                              index
                            ) => (
                              <div
                                className="branch"
                                key={
                                  index
                                }
                              >
                                <span>
                                  {formatLine(
                                    line
                                  )}
                                </span>

                                <button
                                  className="small-delete-button"
                                  onClick={() =>
                                    deleteLine(
                                      rep.side,
                                      index
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            )
                          )}
                        </div>

                        <button
                          onClick={() =>
                            startPractice(
                              rep
                            )
                          }
                        >
                          Practice
                        </button>

                        <button
                          onClick={() =>
                            startFlashcard(
                              rep
                            )
                          }
                        >
                          Flashcard
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </>
          ) : practiceRepertoire ? (
            <>
              <h2>Practice</h2>

              <p className="practice-info">
                <strong>
                  {practiceRepertoire.side ===
                  "white"
                    ? "White"
                    : "Black"}
                </strong>{" "}
                repertoire
                <br />
                Line{" "}
                <strong>
                  {practiceRoundNumber}
                </strong>{" "}
                of{" "}
                <strong>
                  {
                    practiceRepertoire
                      .lines.length
                  }
                </strong>
              </p>

              <div className="moves">
                {moves.length === 0
                  ? "Starting line..."
                  : formatLine(moves)}
              </div>

              <button
                onClick={
                  showPracticeHint
                }
                disabled={
                  isOpponentMoving
                }
              >
                Hint
              </button>

              <button
                onClick={
                  restartPractice
                }
              >
                Restart practice
              </button>

              <button
                onClick={
                  stopPractice
                }
              >
                Exit practice
              </button>
            </>
          ) : (
            <>
              <h2>Flashcard</h2>

              <p className="practice-info">
                Find the best move.
              </p>

              <button
                onClick={
                  showFlashcardHint
                }
                disabled={
                  isLoadingNextFlashcard
                }
              >
                Hint
              </button>

              <button
                onClick={() => {
                  if (
                    flashcardRepertoire &&
                    !isLoadingNextFlashcard
                  ) {
                    nextFlashcard(
                      flashcardRepertoire
                    );
                  }
                }}
              >
                Next position
              </button>

              <button
                onClick={
                  showFlashcardAnswer
                }
                disabled={
                  isLoadingNextFlashcard
                }
              >
                Show answer
              </button>

              <button
                onClick={
                  stopFlashcard
                }
              >
                Exit flashcard
              </button>
            </>
          )}

          {message && (
            <p className="message">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
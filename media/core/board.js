// board.js
import { parseFen } from "./fen.js";
import { addPiece, clearGuiPieces } from "./piece.js";

export const domBoard = document.querySelector('#board');
export const pieceLayer = domBoard.querySelector('#board .piece-layer')
export const squareLayer = domBoard.querySelector('#board .square-layer')
export const markLayer = domBoard.querySelector('#board .mark-layer')
export const FILES = 'abcdefgh';

export const initBoard = () => {
    for(let i = 0; i<8; ++i){
        for(let j = 0; j<8; ++j){
            const domSquare = document.createElement('div');
            const color = (i + j ) % 2 === 0? "dark" : "light";

            domSquare.dataset.square = FILES[j] + (i + 1);
            domSquare.classList.add('square', color);

            squareLayer.append(domSquare);
        }
    }
}

export const renderPosition = (fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") => {
    document.querySelectorAll('.piece-layer .piece').forEach(piece=>piece.remove());
    clearGuiPieces();
    const position = parseFen(fen);
    for(const sq in position){
        const piece = position[sq];
        addPiece(sq, piece);
    }
}

export const resetBoard = () => {
    // clear the board (Piece and marks )
    pieceLayer.childNodes.forEach(e=>e.remove());
    markLayer.childNodes.forEach(e=>e.remove());

    clearGuiPieces();
    renderPosition();
}

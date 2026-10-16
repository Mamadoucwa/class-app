import { useRef, useState, useEffect } from 'react';
import { socket } from './socket';

export default function Whiteboard({ roomId }) {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);

  // Initialiser le canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  // Écouter les dessins des autres
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const handleDraw = ({ x0, y0, x1, y1, color, lineWidth }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };

    const handleClear = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    socket.on('draw', handleDraw);
    socket.on('clear-board', handleClear);

    return () => {
      socket.off('draw', handleDraw);
      socket.off('clear-board', handleClear);
    };
  }, []);

  // Coordonnées de la souris sur le canvas
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;

    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Début du dessin
  const startDrawing = (e) => {
    isDrawingRef.current = true;
    lastPosRef.current = getPos(e);
  };

  // Dessin en cours
  const draw = (e) => {
    if (!isDrawingRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x: x0, y: y0 } = lastPosRef.current;
    const { x: x1, y: y1 } = getPos(e);

    // Dessiner localement
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Envoyer aux autres
    socket.emit('draw', {
      roomId,
      drawData: { x0, y0, x1, y1, color, lineWidth },
    });

    lastPosRef.current = { x: x1, y: y1 };
  };

  // Fin du dessin
  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  // Effacer le tableau
  const clearBoard = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    socket.emit('clear-board', { roomId });
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-white/10">
      {/* Barre d'outils */}
      <div className="flex items-center gap-2 p-3 bg-slate-100 border-b border-slate-200 flex-wrap">
        <span className="text-sm font-bold text-slate-700 mr-1">🎨 Couleur :</span>
        {['#000000', '#e74c3c', '#3498db', '#27ae60', '#f39c12'].map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-7 h-7 rounded-full border-2 transition-transform ${
              color === c ? 'border-purple-500 scale-110' : 'border-slate-300'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}

        <span className="text-sm font-bold text-slate-700 ml-2 mr-1">📏 Épaisseur :</span>
        {[2, 4, 8].map((w) => (
          <button
            key={w}
            onClick={() => setLineWidth(w)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
              lineWidth === w
                ? 'bg-purple-500 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            {w}px
          </button>
        ))}

        <button
          onClick={clearBoard}
          className="ml-auto bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors"
        >
          🗑️ Effacer
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative bg-white">
        <canvas
          ref={canvasRef}
          width={1200}
          height={700}
          className="w-full h-full cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
    </div>
  );
}
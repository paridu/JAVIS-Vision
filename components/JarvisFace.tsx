import React, { useEffect, useRef } from 'react';
import { AgentState } from '../types';

interface JarvisFaceProps {
  state: AgentState;
}

const JarvisFace: React.FC<JarvisFaceProps> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize handler
    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 300;
      canvas.height = canvas.parentElement?.clientHeight || 300;
    };
    window.addEventListener('resize', resize);
    resize();

    // Particle System
    const particleCount = 180;
    const particles: { x: number; y: number; angle: number; radius: number; speed: number; life: number }[] = [];

    // Initialize particles forming a rough face/mask shape
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: 0, 
        y: 0,
        angle: Math.random() * Math.PI * 2,
        radius: 50 + Math.random() * 80, // Base radius
        speed: 0.005 + Math.random() * 0.01,
        life: Math.random()
      });
    }

    const render = () => {
      timeRef.current += 0.01;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Determine colors based on state
      let primaryColor = '251, 191, 36'; // Gold/Amber (Stark default)
      let secondaryColor = '245, 158, 11';
      let glowIntensity = 1;
      let motionMultiplier = 1;

      if (state === AgentState.LISTENING) {
        primaryColor = '6, 182, 212'; // Cyan
        secondaryColor = '34, 211, 238';
        motionMultiplier = 2.0;
      } else if (state === AgentState.THINKING) {
        primaryColor = '168, 85, 247'; // Purple
        secondaryColor = '216, 180, 254';
        motionMultiplier = 0.5;
        glowIntensity = 0.5;
      } else if (state === AgentState.SPEAKING) {
        // Pulse intensely
        motionMultiplier = 3.0;
        glowIntensity = 1.5 + Math.sin(timeRef.current * 10) * 0.5;
      }

      // Draw Connection Lines (The "Neural Net" look)
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1;

      particles.forEach((p, i) => {
        // Update position (Orbiting)
        p.angle += p.speed * motionMultiplier;
        p.life += 0.01;
        
        // Simulating organic movement (Perlin-ish)
        const noise = Math.sin(p.angle * 3 + timeRef.current) * 10 + Math.cos(p.angle * 5) * 5;
        
        // Expansion during speech
        const speechExpansion = state === AgentState.SPEAKING ? (Math.random() * 20 * glowIntensity) : 0;
        
        const currentRadius = p.radius + noise + speechExpansion;
        
        p.x = centerX + Math.cos(p.angle) * currentRadius;
        p.y = centerY + Math.sin(p.angle) * currentRadius * 1.2; // Slightly oval for face shape

        // Draw Particle
        const alpha = 0.4 + Math.sin(p.life) * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${primaryColor}, ${alpha})`;
        ctx.fill();

        // Connect to nearby particles
        for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const dx = p.x - p2.x;
            const dy = p.y - p2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 40) {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = `rgba(${secondaryColor}, ${0.15 * (1 - dist / 40)})`;
                ctx.stroke();
            }
        }
      });

      // Eyes (The "Soul" of Jarvis)
      const eyeOffset = 35;
      const eyeY = -10;
      
      const drawEye = (offsetX: number) => {
          ctx.shadowBlur = 20 * glowIntensity;
          ctx.shadowColor = `rgba(${primaryColor}, 0.8)`;
          ctx.fillStyle = `rgba(${primaryColor}, ${0.8 + Math.random() * 0.2})`;
          
          ctx.beginPath();
          // Almond shape approximation
          ctx.ellipse(centerX + offsetX, centerY + eyeY, 12, 6 * (state === AgentState.IDLE ? 0.2 : 1), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
      };

      // Blink mechanic
      if (Math.random() > 0.02 || state !== AgentState.IDLE) {
          drawEye(-eyeOffset);
          drawEye(eyeOffset);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [state]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
        {/* Holographic Container Circle */}
        <div className={`absolute w-64 h-64 rounded-full border border-dashed opacity-20 animate-spin-slow transition-colors duration-500
            ${state === AgentState.LISTENING ? 'border-cyan-500' : 'border-stark-gold'}`}></div>
        <div className={`absolute w-56 h-56 rounded-full border border-dotted opacity-30 animate-reverse-spin transition-colors duration-500
            ${state === AgentState.LISTENING ? 'border-cyan-500' : 'border-stark-gold'}`} style={{animationDirection: 'reverse', animationDuration: '12s'}}></div>
            
        <canvas ref={canvasRef} className="w-full h-full z-10" />
        
        {/* Glow backdrop */}
        <div className={`absolute w-40 h-40 blur-3xl opacity-20 rounded-full transition-colors duration-500
             ${state === AgentState.LISTENING ? 'bg-cyan-500' : 'bg-stark-gold'}`}></div>
    </div>
  );
};

export default JarvisFace;

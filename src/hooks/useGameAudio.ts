import { useRef, useCallback } from 'react';

export const useGameAudio = () => {
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const tickTackRef = useRef<HTMLAudioElement | null>(null);

  const playSfx = useCallback((filename: string, volume = 1.0) => {
    const audio = new Audio(`/sounds/${filename}`);
    audio.volume = volume;
    audio.play().catch(e => console.log("SFX play failed:", e));
  }, []);

  const playAmbient = useCallback(() => {
    // Pokud instance neexistuje, vytvoříme ji
    if (!ambientRef.current) {
      ambientRef.current = new Audio('/sounds/waitingroom.mp3');
      ambientRef.current.loop = true;
      ambientRef.current.volume = 0.5;
    }
    
    // Pokud je audio zapauzované, nebo skončilo, pustíme ho
    // (Prohlížeč může vyhodit chybu, pokud nebyla interakce, ale to nevadí,
    // zkusíme to znova při kliknutí díky App.tsx)
    if (ambientRef.current.paused) {
      ambientRef.current.play().catch(() => {
        // Tichý catch - víme, že to může selhat před interakcí
      });
    }
  }, []);

  const stopAmbient = useCallback(() => {
    if (ambientRef.current) {
      ambientRef.current.pause();
      // Nechceme nulovat čas, aby to při návratu do lobby pokračovalo, 
      // ale pro waiting room efekt je asi lepší začít od začátku? 
      // Nechme to resetovat.
      ambientRef.current.currentTime = 0;
    }
  }, []);

  const playTickTack = useCallback(() => {
    if (!tickTackRef.current) {
      tickTackRef.current = new Audio('/sounds/ticktack.mp3');
      tickTackRef.current.volume = 0.8;
      // Loopování tikání, kdyby náhodou bylo krátké
      tickTackRef.current.loop = true; 
    }
    if (tickTackRef.current.paused) {
      tickTackRef.current.play().catch(e => console.log("TickTack failed:", e));
    }
  }, []);

  const stopTickTack = useCallback(() => {
    if (tickTackRef.current) {
      tickTackRef.current.pause();
      tickTackRef.current.currentTime = 0;
    }
  }, []);

  return {
    playSfx,
    playAmbient,
    stopAmbient,
    playTickTack,
    stopTickTack
  };
};
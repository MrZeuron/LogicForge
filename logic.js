// Общие вычисления для симулятора. Значения входов: 0 или 1.
const DigitalLogic = {
  AND: { label: 'И', symbol: '∧', note: 'И выдаёт 1, только когда оба входа равны 1.', inputs: 2, run: (a, b) => a & b },
  OR: { label: 'ИЛИ', symbol: '∨', note: 'ИЛИ выдаёт 1, если хотя бы один вход равен 1.', inputs: 2, run: (a, b) => a | b },
  XOR: { label: 'XOR', symbol: '⊕', note: 'XOR выдаёт 1, когда входы различаются.', inputs: 2, run: (a, b) => a ^ b },
  NOT: { label: 'НЕ', symbol: '¬', note: 'НЕ инвертирует вход A; вход B здесь не используется.', inputs: 1, run: (a) => 1 - a }
};

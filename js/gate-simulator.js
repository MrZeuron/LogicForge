'use strict';

const operationButtons = [...document.querySelectorAll('[data-operation]')];
const inputAButton = document.querySelector('#input-a');
const inputBButton = document.querySelector('#input-b');
const inputBControl = document.querySelector('#input-b-control');
const outputElement = document.querySelector('#output');
const expressionElement = document.querySelector('#expression');
const operationNote = document.querySelector('#operation-note');
const truthHead = document.querySelector('#truth-head');
const truthBody = document.querySelector('#truth-body');

let operation = 'AND';
let inputA = 0;
let inputB = 0;

function renderTruthTable(inputs) {
  const headers = inputs === 1 ? ['A', 'Y'] : ['A', 'B', 'Y'];
  const headRow = document.createElement('tr');
  headers.forEach((label) => {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headRow.append(cell);
  });
  truthHead.replaceChildren(headRow);

  const rows = inputs === 1 ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
  const bodyRows = rows.map(([a, b]) => {
    const result = DigitalLogic[operation].run(a, b);
    const row = document.createElement('tr');
    const cells = inputs === 1 ? [a, result] : [a, b, result];
    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    });

    const current = a === inputA && (inputs === 1 || b === inputB);
    row.classList.toggle('current', current);
    row.setAttribute('aria-selected', String(current));
    return row;
  });
  truthBody.replaceChildren(...bodyRows);
}

function render() {
  const definition = DigitalLogic[operation];
  const result = definition.run(inputA, inputB);
  const usesSecondInput = definition.inputs === 2;

  operationButtons.forEach((button) => {
    const selected = button.dataset.operation === operation;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  inputAButton.textContent = String(inputA);
  inputAButton.setAttribute('aria-label', `Вход A: ${inputA}. Нажмите, чтобы переключить`);
  inputAButton.setAttribute('aria-pressed', String(inputA === 1));
  inputAButton.classList.toggle('on', inputA === 1);

  inputBButton.textContent = String(inputB);
  inputBButton.setAttribute('aria-label', `Вход B: ${inputB}. Нажмите, чтобы переключить`);
  inputBButton.setAttribute('aria-pressed', String(inputB === 1));
  inputBButton.classList.toggle('on', inputB === 1);
  inputBButton.disabled = !usesSecondInput;
  inputBControl.classList.toggle('inactive', !usesSecondInput);

  outputElement.textContent = String(result);
  outputElement.classList.toggle('on', result === 1);
  expressionElement.textContent = usesSecondInput
    ? `A ${definition.symbol} B = ${result}`
    : `${definition.symbol}A = ${result}`;
  operationNote.textContent = definition.note;
  renderTruthTable(definition.inputs);
}

operationButtons.forEach((button) => {
  button.addEventListener('click', () => {
    operation = button.dataset.operation;
    render();
  });
});

inputAButton.addEventListener('click', () => {
  inputA = 1 - inputA;
  render();
});

inputBButton.addEventListener('click', () => {
  inputB = 1 - inputB;
  render();
});

render();

'use strict';

import { Option, Some, None, isNone, Maybe } from './option'
import { TextDocuments, TextDocumentPositionParams } from 'vscode-languageserver';
import * as csv from 'fast-csv';

const OPERATORS = [
  '+', '-', '*', '/', '<<', '+=', '-=', '~=',
  '|', '^', '&', '&&', '||', '{', '}', '[', ']'
];
const TOKEN_SEPARATORS = [' ', '.', '\n', '\r', '\r\n'];
const SUB_TOKENS = ['(', '[', '|']

interface RotoscopeRow {
  entity: string;
  method_name: string;
  method_level: string;
  filepath: string;
  lineno: number;
  caller_entity: string;
  caller_method_name: string;
  caller_method_level: string;
};

interface Token {
  name: string;
  startIndex: number;
  endIndex: number;
}

enum EvaluationType { 'Instance', 'Class', 'Method' }
interface InstanceEvaluation { evaluationType: EvaluationType.Instance; class: ClassEvaluation; }
interface ClassEvaluation { evaluationType: EvaluationType.Class; name: string; }
interface MethodEvaluation {
  evaluationType: EvaluationType.Method;
  entity: string;
  method_name: string;
  method_level: string;
  caller_entity: string;
  caller_method_name: string;
  caller_method_level: string;
};

type Evaluation = InstanceEvaluation | ClassEvaluation | MethodEvaluation

class Engine {
  storage: Map<string, RotoscopeRow[]>;
  documents: TextDocuments;

  constructor(documents: TextDocuments) {
    this.storage = new Map();
    this.documents = documents;
  }

  seed(rotoscope_export_path: string) {
    csv.fromPath(rotoscope_export_path, { headers: true })
      .on("data", (data: RotoscopeRow) => {
        const key = `${data.filepath}:${data.lineno}`;
        let value: RotoscopeRow[] = this.storage.get(key) || [];
        value.push(data);
        this.storage.set(key, value);
      });
  }

  evaluate(documentParams: TextDocumentPositionParams) : Evaluation[] {
    const { uri } = documentParams.textDocument;
    const { line, character } = documentParams.position;
    const document = this.documents.get(uri);

    const filepath = uri.substr(uri.lastIndexOf('/') + 1);
    const getTokenMethods = this.methodLookupFn(filepath, line + 1);
    const lineText = document.getText().split(/\r?\n/g)[line];

    const maybeToken = this.parseToken(lineText, character);
    if (isNone(maybeToken)) return [];
    const token = maybeToken.unwrap();

    const methodDataForToken = new Maybe<Token>(maybeToken)
      .then<RotoscopeRow[]>(getTokenMethods)
      .then<Evaluation[]>(methodData => { return new Some(methodData.map(this.rowToMethodEvaluation)) })
      .unwrap_or([]);

    if (methodDataForToken.length > 0) {
      return methodDataForToken;
    }

    return new Maybe<Token>(this.parseToken(lineText, token.endIndex + 1))
      .then<RotoscopeRow[]>(getTokenMethods)
      .then<Evaluation[]>(methodData => { return new Some(methodData.map(this.rowToEntityEvaluation)) })
      .unwrap_or([]);
  }

  private rowToMethodEvaluation(row: RotoscopeRow) : Evaluation {
    const { filepath, lineno, ...partialMethodEval } = row;
    let methodEval: MethodEvaluation = partialMethodEval as any;
    methodEval.evaluationType = EvaluationType.Method;
    return <MethodEvaluation>methodEval;
  }

  private rowToEntityEvaluation(row: RotoscopeRow) : Evaluation {
    const classEval: ClassEvaluation = { evaluationType: EvaluationType.Class, name: row.entity };
    if (row.method_level == "class") return classEval;
    return { evaluationType: EvaluationType.Instance, class: classEval }
  }

  private parseToken(line: string, character: number) : Option<Token> {
    const lhs_line = line.substr(0, character);
    const rhs_line = line.substr(character);

    const lhs = TOKEN_SEPARATORS.reduce((last_occurence: number, separator: string) : number => {
      const index = lhs_line.lastIndexOf(separator);
      return Math.max(index, last_occurence);
    }, 0);

    const rhs = TOKEN_SEPARATORS.reduce((last_occurence: number, separator: string) : number => {
      const index = rhs_line.indexOf(separator);
      return (index == -1) ? last_occurence : Math.min(index, last_occurence);
    }, rhs_line.length);

    let tokenName =  line.substr(lhs+1, character+rhs-lhs-1);

    const subTokenPosition = this.subTokenPosition(tokenName);
    if (subTokenPosition >= 0) {
      if (subTokenPosition + lhs + 1 < character) { return None; }
      else tokenName = tokenName.substr(0, subTokenPosition);
    }

    if (OPERATORS.includes(tokenName)) { return None; }

    return new Some({ name: tokenName, startIndex: lhs + 1, endIndex: character + rhs })
  }

  private subTokenPosition(tokenName: string) : number {
    return SUB_TOKENS.reduce((min, tok) => {
      const index = tokenName.indexOf(tok)
      if (min == -1) return index;
      return (index == -1) ? min : Math.min(index, min);
    }, -1);
  }

  private methodLookupFn(filepath: string, lineno: number) : (x: Token) => Option<RotoscopeRow[]> {
    const key = `${filepath}:${lineno}`;
    const method_calls = this.storage.get(key) || [];
    return (token) => {
      const calls = method_calls.filter((call: RotoscopeRow) : boolean => {
        return call.method_name == token.name;
      });
      return calls.length > 0 ? new Some(calls) : None;
    }
  }
}

export { Engine, Evaluation, EvaluationType };

export type ALUOpcode = "ADD";
export type Word = bigint;

export interface ALUInstruction
{
    op: ALUOpcode;
    a: Word;
    b: Word;
    dest: Word;
}

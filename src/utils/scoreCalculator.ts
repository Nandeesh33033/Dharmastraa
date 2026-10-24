import { Question, Subject, QUESTIONS } from '../constants';

export interface QuestionResult {
  questionId: string | number;
  questionText: string;
  type: 'mcq' | 'multiple_select' | 'true_false' | 'short_answer';
  maxPoints: number;
  earnedPoints: number;
  isCorrect: boolean;
  studentAnswerText: string;
  correctAnswerText: string;
  status: 'correct' | 'incorrect' | 'partial' | 'unanswered';
}

export interface StudentPerformance {
  totalPoints: number;
  earnedPoints: number;
  percentage: number;
  correctCount: number;
  totalQuestions: number;
  grade: string;
  status: 'passed' | 'failed' | 'needs_review' | 'disqualified';
  questionResults: QuestionResult[];
}

export function evaluateStudentSubmission(
  answers: Record<string | number, any> | undefined,
  subjectQuestions?: Question[],
  isDisqualified?: boolean
): StudentPerformance {
  const questionsList = (subjectQuestions && subjectQuestions.length > 0) ? subjectQuestions : QUESTIONS;
  const ansMap = answers || {};

  let totalPoints = 0;
  let earnedPoints = 0;
  let correctCount = 0;

  const questionResults: QuestionResult[] = questionsList.map((q) => {
    const qIdStr = String(q.id);
    const maxPts = q.points || 10;
    totalPoints += maxPts;

    const studentAns = ansMap[qIdStr] ?? ansMap[Number(q.id)];
    const qType = q.type || 'mcq';

    let earned = 0;
    let isCorrect = false;
    let status: 'correct' | 'incorrect' | 'partial' | 'unanswered' = 'unanswered';
    let studentAnsText = 'No Answer Given';
    let correctAnsText = '';

    // Format Correct Answer Text
    if (qType === 'mcq' || qType === 'true_false') {
      const cIdx = typeof q.correctAnswer === 'number' ? q.correctAnswer : 0;
      correctAnsText = q.options?.[cIdx] || `Option ${cIdx}`;
    } else if (qType === 'multiple_select') {
      const cIndices = Array.isArray(q.correctAnswer) ? q.correctAnswer : [0];
      correctAnsText = cIndices.map(idx => q.options?.[idx] || `Option ${idx}`).join(', ');
    } else {
      correctAnsText = String(q.correctAnswer || 'Model answer description');
    }

    if (studentAns === undefined || studentAns === null || studentAns === '') {
      status = 'unanswered';
      studentAnsText = 'Unanswered';
    } else if (qType === 'mcq') {
      const sIdx = typeof studentAns === 'number' ? studentAns : parseInt(studentAns);
      studentAnsText = q.options?.[sIdx] || `Option ${sIdx}`;
      const cIdx = typeof q.correctAnswer === 'number' ? q.correctAnswer : parseInt(String(q.correctAnswer));

      if (sIdx === cIdx) {
        earned = maxPts;
        isCorrect = true;
        status = 'correct';
        correctCount++;
      } else {
        earned = 0;
        isCorrect = false;
        status = 'incorrect';
      }
    } else if (qType === 'true_false') {
      let sVal = studentAns;
      if (typeof studentAns === 'string') {
        sVal = studentAns.toLowerCase() === 'true' || studentAns === '0' ? 0 : 1;
      }
      studentAnsText = sVal === 0 || sVal === true ? 'True' : 'False';
      const cVal = q.correctAnswer === 0 || q.correctAnswer === true || String(q.correctAnswer).toLowerCase() === 'true' ? 0 : 1;

      if (Number(sVal) === Number(cVal)) {
        earned = maxPts;
        isCorrect = true;
        status = 'correct';
        correctCount++;
      } else {
        earned = 0;
        isCorrect = false;
        status = 'incorrect';
      }
    } else if (qType === 'multiple_select') {
      const sArr: number[] = Array.isArray(studentAns) ? studentAns.map(Number) : [Number(studentAns)];
      const cArr: number[] = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(Number) : [Number(q.correctAnswer)];

      studentAnsText = sArr.map(idx => q.options?.[idx] || `Option ${idx}`).join(', ');

      const sSorted = [...sArr].sort();
      const cSorted = [...cArr].sort();

      const exactMatch = sSorted.length === cSorted.length && sSorted.every((v, i) => v === cSorted[i]);
      if (exactMatch) {
        earned = maxPts;
        isCorrect = true;
        status = 'correct';
        correctCount++;
      } else {
        // Calculate partial credit if at least one correct and no wrong selection
        const correctPicks = sSorted.filter(v => cSorted.includes(v)).length;
        const wrongPicks = sSorted.filter(v => !cSorted.includes(v)).length;
        if (correctPicks > 0 && wrongPicks === 0) {
          earned = Math.round((correctPicks / cSorted.length) * maxPts);
          status = 'partial';
        } else {
          earned = 0;
          status = 'incorrect';
        }
      }
    } else if (qType === 'short_answer') {
      studentAnsText = String(studentAns);
      const text = studentAnsText.trim().toLowerCase();
      const expected = String(q.correctAnswer || '').toLowerCase();
      
      // Auto-check basic keywords or provide points if answered meaningfully
      const keywords = expected.split(/\s+/).filter(w => w.length > 3);
      const matchCount = keywords.filter(w => text.includes(w)).length;
      
      if (keywords.length > 0 && matchCount >= Math.ceil(keywords.length * 0.4)) {
        earned = maxPts;
        isCorrect = true;
        status = 'correct';
        correctCount++;
      } else if (text.length > 10) {
        earned = Math.round(maxPts * 0.7); // Partial score for descriptive input
        status = 'partial';
      } else {
        earned = 0;
        status = 'incorrect';
      }
    }

    earnedPoints += earned;

    return {
      questionId: q.id,
      questionText: q.text,
      type: qType,
      maxPoints: maxPts,
      earnedPoints: earned,
      isCorrect,
      studentAnswerText: studentAnsText,
      correctAnswerText: correctAnsText,
      status
    };
  });

  const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  let grade = 'F';
  if (percentage >= 90) grade = 'A+';
  else if (percentage >= 80) grade = 'A';
  else if (percentage >= 70) grade = 'B';
  else if (percentage >= 60) grade = 'C';
  else if (percentage >= 50) grade = 'D';

  let status: 'passed' | 'failed' | 'needs_review' | 'disqualified' = 'passed';
  if (isDisqualified) {
    status = 'disqualified';
  } else if (percentage < 50) {
    status = 'failed';
  }

  return {
    totalPoints,
    earnedPoints,
    percentage,
    correctCount,
    totalQuestions: questionsList.length,
    grade,
    status,
    questionResults
  };
}

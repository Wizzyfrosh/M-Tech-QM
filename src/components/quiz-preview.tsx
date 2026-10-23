"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Eye, LockKeyhole } from "lucide-react";
import type { EditorQuiz } from "@/lib/quiz-policy";
import { formatDeadline } from "@/lib/quiz-policy";
import { useHydrated } from "@/lib/use-hydrated";
export function QuizPreview({ quiz }: { quiz: EditorQuiz }) {
  const [answers, setAnswers] = useState(false);
  const hydrated = useHydrated();
  return (
    <>
      <Link className="back-link" href={`/instructor/quizzes/${quiz.id}`}>
        <ArrowLeft size={16} />
        Back to editor
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INSTRUCTOR PREVIEW</span>
          <h1>{quiz.title}</h1>
          <p>Preview the saved questions. No attempt or score is recorded.</p>
        </div>
        <button
          className="button"
          disabled={!hydrated}
          onClick={() => setAnswers(!answers)}
        >
          <Eye size={17} />
          {answers ? "Hide answer key" : "Show answer key"}
        </button>
      </div>
      <section className="panel quiz-preview-intro">
        <span className="badge lavender">
          {quiz.lessonLabel || "Lesson not added"}
        </span>
        <p className="pre-wrap">{quiz.description}</p>
        <div className="quiz-card-meta">
          <span>
            {quiz.questions.length} questions ·{" "}
            {quiz.questions.reduce((sum, q) => sum + q.marks, 0)} marks
          </span>
          <span>{formatDeadline(quiz.deadline)}</span>
        </div>
        {(quiz.lessonUrls?.length ? quiz.lessonUrls : quiz.lessonUrl ? [quiz.lessonUrl] : []).map((url, i) =>
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-button">
            Watch video part {i + 1}
          </a>
        )}
      </section>
      {answers && (
        <p className="notice quiz-lock">
          <LockKeyhole size={17} />
          Answer key · Instructor only
        </p>
      )}
      <div className="preview-questions">
        {quiz.questions.map((q, index) => (
          <section key={index} className="panel">
            <div className="panel-heading">
              <h2>Question {index + 1}</h2>
              <span className="badge lavender">{q.marks} marks</span>
            </div>
            <pre className="question-prompt">
              {q.prompt || "Question text not added yet."}
            </pre>
            <ol className="preview-options">
              {q.options.map((option, i) => (
                <li
                  className={
                    answers && q.correctIndex === i ? "correct-option" : ""
                  }
                  key={i}
                >
                  <span>{String.fromCharCode(65 + i)}</span>
                  <p className="pre-wrap">
                    {option || "Option not added yet."}
                  </p>
                  {answers && q.correctIndex === i && <strong>Correct</strong>}
                </li>
              ))}
            </ol>
            {answers && (
              <div className="answer-explanation">
                <strong>Explanation</strong>
                <p className="pre-wrap">
                  {q.explanation || "Explanation not added yet."}
                </p>
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

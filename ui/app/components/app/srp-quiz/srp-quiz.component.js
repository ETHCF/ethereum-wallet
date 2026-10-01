import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Button from '../../ui/button'
import { useI18nContext } from '../../../hooks/useI18nContext'

export const QUESTIONS = [
  {
    question: 'srpQuizQuestionOne',
    answers: [
      { text: 'srpQuizQuestionOneWrongAnswer', correct: false },
      { text: 'srpQuizQuestionOneRightAnswer', correct: true },
    ],
    right: ['srpQuizQuestionOneRightAnswerTitle', 'srpQuizQuestionOneRightAnswerDescription'],
    wrong: ['srpQuizQuestionOneWrongAnswerTitle', 'srpQuizQuestionOneWrongAnswerDescription'],
  },
  {
    question: 'srpQuizQuestionTwo',
    answers: [
      { text: 'srpQuizQuestionTwoRightAnswer', correct: true },
      { text: 'srpQuizQuestionTwoWrongAnswer', correct: false },
    ],
    right: ['srpQuizQuestionTwoRightAnswerTitle', 'srpQuizQuestionTwoRightAnswerDescription'],
    wrong: ['srpQuizQuestionTwoWrongAnswerTitle', 'srpQuizQuestionTwoWrongAnswerDescription'],
  },
]

/**
 * Two questions that must be answered correctly before the seed phrase can be
 * revealed, so a user being coached by a scammer hears the warning first.
 */
export default function SrpQuiz ({ onComplete }) {
  const t = useI18nContext()
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState(null)
  const { question, answers, right, wrong } = QUESTIONS[index]

  if (result) {
    const [title, description] = result === 'right' ? right : wrong
    return (
      <div className={`srp-quiz srp-quiz--${result}`} data-testid={`srp-quiz-${result}`}>
        <div className="srp-quiz__progress">{t('srpQuizProgress', [index + 1, QUESTIONS.length])}</div>
        <div className="srp-quiz__result-title">{t(title)}</div>
        <div className="srp-quiz__result-description">{t(description)}</div>
        <Button
          type="secondary"
          large
          data-testid={result === 'right' ? 'srp-quiz-continue' : 'srp-quiz-try-again'}
          onClick={() => {
            setResult(null)
            if (result === 'right') {
              if (index + 1 === QUESTIONS.length) {
                onComplete()
              } else {
                setIndex(index + 1)
              }
            }
          }}
        >
          {t(result === 'right' ? 'next' : 'tryAgain')}
        </Button>
      </div>
    )
  }

  return (
    <div className="srp-quiz" data-testid="srp-quiz">
      <div className="srp-quiz__title">{t('srpQuizTitle')}</div>
      <div className="srp-quiz__description">{t('srpQuizDescription')}</div>
      <div className="srp-quiz__progress">{t('srpQuizProgress', [index + 1, QUESTIONS.length])}</div>
      <div className="srp-quiz__question">{t(question)}</div>
      {answers.map(({ text, correct }) => (
        <Button
          key={text}
          type="default"
          large
          className="srp-quiz__answer"
          data-testid={correct ? 'srp-quiz-right-answer' : 'srp-quiz-wrong-answer'}
          onClick={() => setResult(correct ? 'right' : 'wrong')}
        >
          {t(text)}
        </Button>
      ))}
    </div>
  )
}

SrpQuiz.propTypes = {
  onComplete: PropTypes.func.isRequired,
}

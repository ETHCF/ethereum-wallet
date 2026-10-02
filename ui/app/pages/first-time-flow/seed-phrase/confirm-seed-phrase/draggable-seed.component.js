import React, { useState } from 'react'
import PropTypes from 'prop-types'
import classnames from 'classnames'

// A seed word that can be dragged (`draggable`) onto another (`droppable`),
// using the browser's native drag and drop.
export default function DraggableSeed ({
  className,
  onClick,
  index,
  seedIndex,
  word,
  selected,
  draggable,
  droppable,
  draggingSeedIndex,
  setDraggingSeedIndex,
  setHoveringIndex,
  onDrop,
}) {
  const [isOver, setIsOver] = useState(false)
  const canDrop = Boolean(droppable) && draggingSeedIndex > -1
  const isDragging = Boolean(draggable) && draggingSeedIndex === seedIndex

  const dragProps = draggable
    ? {
      draggable: true,
      onDragStart: (event) => {
        // Firefox only starts a drag that carries data.
        event.dataTransfer.setData('text/plain', word)
        event.dataTransfer.effectAllowed = 'move'
        // Wait for the browser to snapshot the dragged element before restyling it.
        setTimeout(() => setDraggingSeedIndex(seedIndex), 0)
      },
      onDragEnd: () => setDraggingSeedIndex(-1),
    }
    : {}

  const dropProps = canDrop
    ? {
      onDragOver: (event) => {
        event.preventDefault()
        if (!isOver) {
          setIsOver(true)
          setHoveringIndex(index)
        }
      },
      onDragLeave: () => {
        setIsOver(false)
        setHoveringIndex(-1)
      },
      onDrop: (event) => {
        event.preventDefault()
        setIsOver(false)
        onDrop(index)
      },
    }
    : {}

  return (
    <div
      className={classnames('btn-secondary notranslate confirm-seed-phrase__seed-word', className, {
        'confirm-seed-phrase__seed-word--selected btn-primary': selected,
        'confirm-seed-phrase__seed-word--dragging': isDragging,
        'confirm-seed-phrase__seed-word--empty': !word,
        'confirm-seed-phrase__seed-word--active-drop': !isOver && canDrop,
        'confirm-seed-phrase__seed-word--drop-hover': isOver && canDrop,
      })}
      onClick={onClick}
      data-testid={`draggable-seed-${selected ? 'selected-' : ''}${word}`}
      {...dragProps}
      {...dropProps}
    >
      { word }
    </div>
  )
}

DraggableSeed.propTypes = {
  className: PropTypes.string,
  onClick: PropTypes.func,
  // Position of this slot; dropping here moves the dragged word to it.
  index: PropTypes.number,
  // Index of this word in the sorted seed words.
  seedIndex: PropTypes.number,
  word: PropTypes.string,
  selected: PropTypes.bool,
  draggable: PropTypes.bool,
  droppable: PropTypes.bool,
  draggingSeedIndex: PropTypes.number,
  setDraggingSeedIndex: PropTypes.func,
  setHoveringIndex: PropTypes.func.isRequired,
  onDrop: PropTypes.func,
}

DraggableSeed.defaultProps = {
  className: '',
  onClick: undefined,
  draggingSeedIndex: -1,
}

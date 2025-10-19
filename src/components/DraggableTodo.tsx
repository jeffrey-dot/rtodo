import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Todo } from '../utils/database';

interface DraggableTodoProps {
  todo: Todo;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  readonly?: boolean;
  disableCompletion?: boolean;
}

function DraggableTodo({ todo, onToggle, onDelete, readonly = false, disableCompletion = false }: DraggableTodoProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id, disabled: readonly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gray-800 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow"
      data-testid="todo-item"
    >
      <div className="flex items-center gap-3">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className={`p-1 transition-colors ${
            readonly
              ? 'cursor-not-allowed text-gray-600'
              : 'cursor-grab active:cursor-grabbing text-gray-400 hover:text-white'
          }`}
          title={readonly ? '历史数据 - 无法拖动' : 'Drag to reorder'}
          data-testid="todo-drag-handle"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </div>

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => !readonly && !disableCompletion && onToggle(todo.id)}
          disabled={readonly || disableCompletion}
          className={`w-4 h-4 rounded focus:ring-2 ${
            readonly || disableCompletion
              ? 'cursor-not-allowed bg-gray-600 border-gray-500'
              : 'text-blue-500 cursor-pointer focus:ring-blue-400'
          }`}
          title={
            readonly
              ? '历史数据 - 无法标记完成'
              : disableCompletion
              ? '未来日期 - 无法标记完成'
              : undefined
          }
          data-testid="todo-toggle"
        />

        {/* Todo Text */}
        <div className="flex-1">
          <p
            className={`${
              todo.completed ? 'line-through text-gray-400' : 'text-white'
            } text-sm`}
          >
            {todo.text}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {todo.createdAt?.toLocaleString()}
          </p>
        </div>

        {/* Delete Button */}
        <button
          onClick={() => !readonly && onDelete(todo.id)}
          disabled={readonly}
          className={`p-1.5 rounded-lg transition-colors ${
            readonly
              ? 'cursor-not-allowed text-gray-600'
              : 'text-red-400 hover:bg-red-900/30'
          }`}
          title={readonly ? '历史数据 - 无法删除' : 'Delete task'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function areEqual(prev: DraggableTodoProps, next: DraggableTodoProps) {
  return (
    prev.readonly === next.readonly &&
    prev.disableCompletion === next.disableCompletion &&
    prev.todo.id === next.todo.id &&
    prev.todo.text === next.todo.text &&
    prev.todo.completed === next.todo.completed &&
    prev.todo.sort_order === next.todo.sort_order &&
    prev.onToggle === next.onToggle &&
    prev.onDelete === next.onDelete
  );
}

export default memo(DraggableTodo, areEqual);

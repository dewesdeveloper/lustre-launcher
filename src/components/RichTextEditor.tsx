import ReactQuill from 'react-quill-new';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const modules = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    [{ header: [2, 3, 4, false] }],
    ['blockquote'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image', 'video'],
    ['clean'],
  ],
  clipboard: {
    matchVisual: false,
  },
};

const formats = [
  'header',
  'bold', 'italic', 'underline', 'strike',
  'blockquote',
  'list', 'bullet',
  'link', 'image', 'video',
];

const RichTextEditor = ({ value, onChange, placeholder, minHeight = 120 }: RichTextEditorProps) => {
  return (
    <div style={{ minHeight }}>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder || 'Напишите что-нибудь...'}
      />
    </div>
  );
};

export default RichTextEditor;

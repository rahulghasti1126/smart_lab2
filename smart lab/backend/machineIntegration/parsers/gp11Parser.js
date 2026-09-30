export const parseGp11Message = () => {
  const error = new Error('GP11 protocol specification required');
  error.code = 'PROTOCOL_SPECIFICATION_REQUIRED';
  throw error;
};

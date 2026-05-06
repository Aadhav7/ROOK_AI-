import os
from .banana_gen import generate_response

class SyllabusBrain:
    def __init__(self, data_path="data/"):
        self.data_path = data_path
        self.knowledge_base = self._load_data()

    def _load_data(self):
        content = ""
        for filename in os.listdir(self.data_path):
            if filename.endswith(".txt"):
                with open(os.path.join(self.data_path, filename), 'r') as f:
                    content += f.read() + "\n"
            # Note: For PDFs, you'd use a library like PyPDF2 here
        return content

    def query(self, user_input):
        # In a full RAG, you'd use embeddings to find specific sections.
        # For now, we pass the loaded knowledge as context.
        return generate_response(user_input, context=self.knowledge_base)
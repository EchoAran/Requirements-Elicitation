from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    
    user_id = Column(Integer, primary_key=True)
    user_account = Column(String(20), nullable=False)
    user_name = Column(String(20), nullable=False)
    user_email = Column(String(20), nullable=True)
    user_password = Column(String(20), nullable=False)
    user_role = Column(Enum('Admin', 'User', name='user_role_enum'), nullable=False)
    updated_time = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan", passive_deletes=True)

class Project(Base):
    __tablename__ = 'projects'
    
    project_id = Column(Integer, primary_key=True)
    project_name = Column(String(255), nullable=False)
    initial_requirements = Column(Text, nullable=False)
    project_status = Column(Enum('Pending', 'Ongoing', 'Completed', name='project_status_enum'), nullable=False)
    interview_report = Column(Text, nullable=True)
    created_time = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    user_id = Column(Integer, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    domain_ids = Column(Text, nullable=True)  # JSON array of domain_id integers
    priority_sequence = Column(Text, nullable=True)  # JSON array of priority items

    user = relationship("User", back_populates="projects")
    sections = relationship("Section", back_populates="project", cascade="all, delete-orphan", passive_deletes=True)

class Section(Base):
    __tablename__ = 'sections'
    
    section_id = Column(Integer, primary_key=True)
    section_number = Column(String(50), nullable=False)  # The naming convention is section-XXX
    section_content = Column(Text, nullable=False)
    project_id = Column(Integer, ForeignKey('projects.project_id', ondelete='CASCADE'), nullable=False)

    project = relationship("Project", back_populates="sections")
    topics = relationship("Topic", back_populates="section", cascade="all, delete-orphan", passive_deletes=True)

class Topic(Base):
    __tablename__ = 'topics'
    
    topic_id = Column(Integer, primary_key=True)
    topic_number = Column(String(50), nullable=False)  # The naming convention is topic-XXX-XXX (The number in the first paragraph is the number of the section to which it belongs)
    topic_content = Column(Text, nullable=False)
    topic_status = Column(Enum('Pending', 'Ongoing', 'Completed', 'SystemInterrupted', 'UserInterrupted', 'Failed', name='topic_status_enum'), nullable=False)
    is_necessary = Column(Boolean, nullable=False, default=True)
    section_id = Column(Integer, ForeignKey('sections.section_id', ondelete='CASCADE'), nullable=False)

    section = relationship("Section", back_populates="topics")
    slots = relationship("Slot", back_populates="topic", cascade="all, delete-orphan", passive_deletes=True)
    messages = relationship("Message", back_populates="topic", cascade="all, delete-orphan", passive_deletes=True)

class Slot(Base):
    __tablename__ = 'slots'
    
    slot_id = Column(Integer, primary_key=True)
    slot_number = Column(String(50), nullable=False)  # The naming convention is slot-XXX-XXX-XXX (The numbers in the first paragraph and the second paragraph are the numbers of the section and topic, respectively)
    slot_key = Column(String(255), nullable=False)
    slot_value = Column(Text, nullable=True)
    is_necessary = Column(Boolean, nullable=False)
    topic_id = Column(Integer, ForeignKey('topics.topic_id', ondelete='CASCADE'), nullable=False)
    evidence_message_ids = Column(Text, nullable=True)

    topic = relationship("Topic", back_populates="slots")

class Message(Base):
    __tablename__ = 'messages'
    
    message_id = Column(Integer, primary_key=True)
    role = Column(Enum('Interviewee', 'Interviewer', name='role_enum'), nullable=False)
    message_type = Column(Enum('Text', 'Audio', name='message_type_enum'), nullable=False)
    message_content = Column(Text, nullable=False)
    audio_path = Column(String(255), nullable=True)
    created_time = Column(DateTime, default= lambda: datetime.now(timezone.utc), nullable=False)
    topic_id = Column(Integer, ForeignKey('topics.topic_id', ondelete='CASCADE'), nullable=False)

    topic = relationship("Topic", back_populates="messages")

class DomainExperience(Base):
    __tablename__ = 'domain_experiences'
    
    domain_id = Column(Integer, primary_key=True)
    domain_number = Column(String(50), nullable=False)  # The naming convention is domain-XXX
    domain_name = Column(String(255), nullable=False)
    domain_description = Column(Text, nullable=False)
    domain_experience_content = Column(Text, nullable=False)
    user_id = Column(Integer, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    updated_time = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    tags = Column(Text, nullable=True)
    embedding = Column(Text, nullable=True)
    
    user = relationship("User")

class FrameworkTemplate(Base):
    __tablename__ = 'framework_templates'

    template_id = Column(Integer, primary_key=True)
    template_name = Column(String(255), nullable=False)
    template_description = Column(Text, nullable=True)
    template_content = Column(Text, nullable=False)
    user_id = Column(Integer, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    updated_time = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User")

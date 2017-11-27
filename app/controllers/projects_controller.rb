class ProjectsController < ApplicationController
  before_action :set_project, only: [:show, :edit, :update, :destroy]
  before_action :login_required, only: [:new, :edit, :create, :update, :destroy, :index, :show]
  clear_respond_to
  respond_to :json

  # GET /projects
  # GET /projects.json
  def index
    @projects = Project.all
  end

  # GET /projects/1
  # GET /projects/1.json
  def show
  end

  # GET /projects/new
  def new
    @project = Project.new
  end

  # GET /projects/1/edit
  def edit
  end

  # Get /projects/1/visuals
  def visuals
    project_id = params[:id]
    if project_id
      project_info = Project.select('name').where(id: project_id)
      @project_name = project_info[0].name if project_info[0]
      # we can avoid many joins, when we create a relationship between reports and projects, or with the samples
      # time_start = Time.now
      sql = <<-SQL
      SELECT samples.name, reports.id FROM projects
      INNER JOIN samples ON projects.id = samples.project_id
      INNER JOIN pipeline_outputs ON samples.id = pipeline_outputs.sample_id
      INNER JOIN reports ON reports.pipeline_output_id = pipeline_outputs.id
      WHERE projects.id = ?
      SQL
      @csv_records = []
      find_reports = ActiveRecord::Base.connection.raw_connection.prepare(sql).execute(project_id)
      # time_end = Time.now
      # p 'Query took', "#{(time_end - time_start)} seconds"
      find_reports.each do |record|
        @csv_records.push(name: record.first, link: fetch_csv_url(record.last))
      end
    end
  end

  # POST /projects
  # POST /projects.json
  def create
    @project = Project.new(project_params)

    respond_to do |format|
      if @project.save
        format.html { redirect_to @project, notice: 'Project was successfully created.' }
        format.json { render :show, status: :created, location: @project }
      else
        format.html { render :new }
        format.json { render json: @project.errors.full_messages, status: :unprocessable_entity }
      end
    end
  end

  # PATCH/PUT /projects/1
  # PATCH/PUT /projects/1.json
  def update
    respond_to do |format|
      if @project.update(project_params)
        format.html { redirect_to @project, notice: 'Project was successfully updated.' }
        format.json { render :show, status: :ok, location: @project }
      else
        format.html { render :edit }
        format.json { render json: @project.errors.full_messages, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /projects/1
  # DELETE /projects/1.json
  def destroy
    @project.destroy
    respond_to do |format|
      format.html { redirect_to projects_url, notice: 'Project was successfully destroyed.' }
      format.json { head :no_content }
    end
  end

  private

  # Use callbacks to share common setup or constraints between actions.
  def set_project
    @project = Project.find(params[:id])
  end

  # Never trust parameters from the scary internet, only allow the white list through.
  def project_params
    params.require(:project).permit(:name, user_ids: [], sample_ids: [])
  end
end
